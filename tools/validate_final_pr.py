"""Validate the review candidate without starting services or writing any DB."""
import argparse
import ast
from html.parser import HTMLParser
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT=Path(__file__).resolve().parents[1]
APP=ROOT/'app/gb-system/app'


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag in ('script','img','link'):
            value=attrs.get('src') or attrs.get('href')
            if value and not value.startswith(('#','data:','http:','https:','blob:','//')):
                self.paths.append(value)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node',default=shutil.which('node'))
    parser.add_argument('--docker',help='Use the locally built gb-system:pr-review image for Python regressions')
    args=parser.parse_args()
    if not args.node:
        raise SystemExit('Node.js is required for JavaScript syntax checks')
    report={'scope':'static checks + existing local regression tests; no AWS, DB or browser UI test',
            'date':'2026-10-25','errors':[]}
    # Read-only candidate mount, no DB volumes and no external network for tests.
    python_command=([args.docker,'run','--rm','--network','none',
                     '--mount',f'type=bind,source={APP},target=/app,readonly',
                     '--workdir','/app','--entrypoint','python','gb-system:pr-review']
                    if args.docker else [sys.executable])
    report['python_test_environment']='isolated Docker image' if args.docker else 'current Python; requires app/requirements.txt'
    report['source_manifest_sha256']=hashlib.sha256((ROOT/'docs/final-pr/source-manifest.json').read_bytes()).hexdigest()
    selected=[]
    for manifest in (ROOT/'docs/final-pr/manifests').glob('*.txt'):
        selected.extend(manifest.read_text(encoding='utf-8').splitlines())
    report['selected_files']=len(selected)
    report['unique_files']=len(set(selected))
    # Exact release/bundle hashes must survive Windows Git checkout and stash.
    protected=[name for name in selected if name!='.gitignore']
    attributes=subprocess.run(['git','check-attr','-z','--stdin','text'],cwd=ROOT,
        input='\0'.join(protected)+'\0',capture_output=True,text=True,encoding='utf-8')
    fields=attributes.stdout.rstrip('\0').split('\0')
    unprotected=[fields[i] for i in range(0,len(fields)-2,3) if fields[i+2]!='unset']
    if attributes.returncode or len(fields)!=3*len(protected) or unprotected:
        report['errors'].append({'check':'Git preserves reviewed bytes','paths':unprotected})
    report['git_byte_preservation_paths']=len(protected)
    report['selected_bytes']=sum((ROOT/name).stat().st_size for name in selected)
    report['largest_file']=max(({'path':name,'bytes':(ROOT/name).stat().st_size} for name in selected),key=lambda item:item['bytes'])
    python_files=[ROOT/name for name in selected if name.endswith('.py')]
    for path in python_files:
        try: ast.parse(path.read_text(encoding='utf-8-sig'),filename=str(path))
        except SyntaxError as error: report['errors'].append({'path':path.relative_to(ROOT).as_posix(),'check':'python syntax','error':str(error)})
    report['python_syntax_files']=len(python_files)
    js_files=[ROOT/name for name in selected if name.endswith(('.js','.mjs'))]
    for path in js_files:
        result=subprocess.run([args.node,'--check',str(path)],capture_output=True,text=True,timeout=20)
        if result.returncode:
            report['errors'].append({'path':path.relative_to(ROOT).as_posix(),'check':'JS syntax','error':result.stderr[-1000:]})
    report['js_syntax_files']=len(js_files)
    # COPY input existence, not a claim of a successful image build.
    copy_inputs=[]
    for line in (APP/'Dockerfile').read_text(encoding='utf-8').splitlines():
        if line.startswith('COPY '):
            parts=[part for part in line.split()[1:] if not part.startswith('--')]
            copy_inputs.extend(parts[:-1])
    missing=[name for name in copy_inputs if not (APP/name).exists()]
    if missing: report['errors'].append({'check':'Docker COPY inputs','missing':missing})
    report['docker_copy_inputs']=len(copy_inputs)
    refs=[]
    for base in (APP,):
        parsed=References()
        parsed.feed((base/'index.html').read_text(encoding='utf-8-sig'))
        for ref in parsed.paths:
            path=base/unquote(urlsplit(ref).path.lstrip('/'))
            if not path.exists():
                report['errors'].append({'check':'HTML asset reference','path':str(path.relative_to(ROOT))})
            refs.append(str(path.relative_to(ROOT)))
    report['html_asset_references']=len(refs)
    # Catch broken runtime references after removing unused assets. Fan images
    # are chosen dynamically, so explicitly include all 2 x 2 x 3 combinations.
    asset_refs=set()
    for name in selected:
        path=ROOT/name
        if name.startswith('app/gb-system/app/') and path.suffix in ('.js','.css','.html','.webmanifest') and '/tests/' not in name:
            asset_refs.update(re.findall(r'assets/[A-Za-z0-9_./-]+\.(?:png|webp|woff)',path.read_text(encoding='utf-8-sig')))
    asset_refs.update(f'assets/fan-states/fan{model}_{theme}_{state}.png'
                     for model in ('01','02') for theme in ('dark','light') for state in ('normal','warning','alarm'))
    for name in sorted(asset_refs):
        if not (APP/name).is_file() or 'app/gb-system/app/'+name not in selected:
            report['errors'].append({'check':'runtime asset absent from PR','path':name})
    report['runtime_asset_references']=len(asset_refs)
    optimization=json.loads((APP/'assets/optimized/manifest.json').read_text(encoding='utf-8'))
    report['optimized_manifest_entries']=len(optimization)
    for original,entry in optimization.items():
        original_path=APP/original
        optimized_path=APP/entry['file']
        if not original_path.is_file() or not optimized_path.is_file():
            report['errors'].append({'check':'optimized asset exists','path':original})
        elif hashlib.sha256(original_path.read_bytes()).hexdigest()!=entry['source_sha256']:
            report['errors'].append({'check':'optimized source hash','path':original})
    font_refs=re.findall(r'url\([\"\']?([^\)\"\']+)',(APP/'css/font-subsets.css').read_text(encoding='utf-8'))
    report['font_subset_references']=len(font_refs)
    for ref in font_refs:
        if not (APP/'css'/ref).is_file():
            report['errors'].append({'check':'font subset exists','path':ref})
    # The browser loads bundles, so source checks alone cannot prove the deployed UI.
    bundle=json.loads((APP/'js/build-manifest.json').read_text(encoding='utf-8'))
    bundle_inputs={**bundle['sources'],**bundle['files']}
    report['bundle_hash_checks']=len(bundle_inputs)
    for name,expected in bundle_inputs.items():
        path=APP/name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
            report['errors'].append({'check':'bundle/source hash','path':name})
    # Detect high-confidence secret formats; return filenames only, never matches.
    flags=[]
    private=re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{25,}')
    for name in selected:
        path=ROOT/name
        if path.suffix in ('.py','.js','.mjs','.json','.html','.sql','.yaml','.yml','.txt','.md','.css') and path.stat().st_size<5_000_000:
            if private.search(path.read_text(encoding='utf-8-sig',errors='replace')):
                flags.append(name)
    report['high_confidence_secret_paths']=flags
    if flags: report['errors'].append({'check':'secret patterns','files':flags})
    result=subprocess.run([*python_command,'-m','unittest','discover','-s','tests','-p','test_static_delivery.py','-v'],
                          cwd=APP,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
    report['static_delivery_tests']={'passed':result.returncode==0,'output':result.stdout+result.stderr}
    if result.returncode: report['errors'].append({'check':'static delivery tests','returncode':result.returncode})
    # Explicit mock/loopback suites only; live-DB fixture scripts are not discovered.
    suites=['test_report_review_metadata','test_refresh_delivery',
            'test_performance_regressions','test_read_performance']
    report['python_regression_tests']=[]
    for suite in suites:
        result=subprocess.run([*python_command,'-m','unittest','discover','-s','tests','-p',suite+'.py','-v'],
                              cwd=APP,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
        output=result.stdout+result.stderr
        report['python_regression_tests'].append({'suite':suite,'passed':result.returncode==0,
            'totals':[line for line in output.splitlines() if line.startswith(('Ran ','OK','FAILED'))]})
        if result.returncode:
            report['errors'].append({'check':suite,'output':output[-5000:]})
    # Includes the new time-label regression, replay isolation, and existing UI rules.
    js_tests=sorted((APP/'tests').glob('*.test.mjs'))
    result=subprocess.run([args.node,'--test','--test-reporter=tap',*[str(path) for path in js_tests]],
                          cwd=APP,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90)
    totals=[line for line in result.stdout.splitlines() if line.startswith(('# tests','# pass','# fail','# skipped'))]
    report['javascript_tests']={'files':len(js_tests),'passed':result.returncode==0,'totals':totals}
    if result.returncode:
        report['errors'].append({'check':'JavaScript regression tests','output':(result.stdout+result.stderr)[-5000:]})
    report['passed']=not report['errors'] and report['selected_files']==report['unique_files']
    (ROOT/'docs/final-pr/validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='static_delivery_tests'},ensure_ascii=False,indent=2))
    print(json.dumps({'static_delivery_tests':report['static_delivery_tests']},ensure_ascii=False))
    if not report['passed']:
        raise SystemExit(1)


if __name__=='__main__':
    main()

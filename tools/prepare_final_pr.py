"""Prepare review candidates without changing the running app, Git index or AWS.

Selected sources are copied into app/gb-system. Only the optimized-image index
is filtered to retained assets; its original and derived hashes are recorded.
A later --check detects
changes made by the deployment chat. Existing edited candidates are never silently
overwritten. Demo archives are inspected selectively, not extracted wholesale.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT/'outputs/gummybearing-role-preview-20261023'
TARGET = ROOT/'app/gb-system'
DOCS = ROOT/'docs/final-pr'
MANIFEST = DOCS/'source-manifest.json'
LEGACY = 'GB_WEB/gummybearing-fan-service-v8/'
DEMO_TARGET = ROOT/'demos/local-fan-v8'
BLOCKED = {'.preview', '.runtime', '.secrets', '__pycache__', 'node_modules', '.git', '__MACOSX'}
PRIVATE_SUFFIXES = {'.pem', '.key', '.p12', '.pfx', '.sqlite', '.sqlite3', '.db', '.pyc'}
EXCLUSIONS = json.loads((DOCS/'pr-exclusions.json').read_text(encoding='utf-8'))['paths']


def included(name):
    return not any(name.startswith(key) if key.endswith('/') else name==key for key in EXCLUSIONS)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def is_source(path):
    return (not any(part in BLOCKED for part in path.parts)
            and path.suffix.lower() not in PRIVATE_SUFFIXES
            and not path.name.startswith(('._', '.env'))
            and path.name not in ('.DS_Store', 'Thumbs.db', 'Desktop.ini'))


def selected_sources():
    files = [p for p in (SOURCE/'app').rglob('*') if p.is_file() and is_source(p.relative_to(SOURCE))]
    # Only schema changes, never calendar replacements or actor reassignment SQL.
    files += sorted((SOURCE/'migrations').glob('*_additive.sql'))
    files += [SOURCE/'db'/name for name in ('01_schema.sql', '02_mock_seed.sql', 'mysql-cli.sh', 'provision-app.sh')]
    return sorted(p for p in files if included((TARGET/p.relative_to(SOURCE)).relative_to(ROOT).as_posix()))


def candidate_bytes(path):
    if path.relative_to(SOURCE).as_posix()=='app/assets/optimized/manifest.json':
        original=json.loads(path.read_text(encoding='utf-8'))
        filtered={name:entry for name,entry in original.items()
                  if included('app/gb-system/app/'+name) and included('app/gb-system/app/'+entry['file'])}
        return (json.dumps(filtered,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    return path.read_bytes()


def source_manifest():
    result={}
    for p in selected_sources():
        body=candidate_bytes(p)
        entry={'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body)}
        if entry['sha256']!=digest(p):
            entry.update(source_sha256=digest(p),transform='Filter optimized-image index to included assets only')
        result[p.relative_to(SOURCE).as_posix()]=entry
    return result


def copy_sources():
    if not (SOURCE/'app').is_dir():
        raise SystemExit('Working preview is absent. Use --check to verify the committed candidate, not to refresh it.')
    current = source_manifest()
    old = json.loads(MANIFEST.read_text(encoding='utf-8'))['files'] if MANIFEST.exists() else {}
    removed = sorted(set(old)-set(current))
    if any(included('app/gb-system/'+name) for name in removed):
        raise SystemExit('Source files removed; review candidates manually: '+', '.join(removed))
    # Preflight all files before any overwrite, preserving teammate edits.
    for name, entry in current.items():
        target = TARGET/name
        if target.exists() and digest(target) != entry['sha256']:
            if name not in old or digest(target) != old[name]['sha256']:
                raise SystemExit('Candidate has independent edits; review manually: '+name)
    for name, entry in current.items():
        target = TARGET/name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or digest(target) != entry['sha256']:
            target.write_bytes(candidate_bytes(SOURCE/name))
    if source_manifest() != current:
        raise SystemExit('Source changed during copy. Wait for UI/deployment work, then rerun.')
    assert all(digest(TARGET/name) == entry['sha256'] for name,entry in current.items())
    DOCS.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({'source':SOURCE.relative_to(ROOT).as_posix(),
        'target':TARGET.relative_to(ROOT).as_posix(), 'status':'review-candidate; deployment evidence recorded separately',
        'files':current},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def import_demos(inbox):
    provenance = {}
    for name in ('GummyBearing_ERP_Demo.html', 'rotating_equipment_dashboard_standalone.html'):
        source = inbox/name
        target = ROOT/'demos'/name
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists() and digest(target) != digest(source):
            raise SystemExit('Demo already differs: '+name)
        shutil.copy2(source,target)
        provenance[name]={'sha256':digest(source),'bytes':source.stat().st_size,'copy':'unchanged'}
    archive_path = inbox/'GB_WEB.zip'
    selected=[]
    groups=defaultdict(lambda:{'files':0,'bytes':0})
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            name=info.filename
            # Some archive names store UTF-8 bytes without the ZIP UTF-8 flag.
            if not info.flag_bits & 0x800:
                try: name=name.encode('cp437').decode('utf-8')
                except (UnicodeEncodeError,UnicodeDecodeError): pass
            name=unicodedata.normalize('NFC',name)
            parts=PurePosixPath(name).parts
            key='/'.join(parts[:2])
            groups[key]['files']+=1
            groups[key]['bytes']+=info.file_size
            if not name.startswith(LEGACY):
                continue
            relative=PurePosixPath(name[len(LEGACY):])
            if relative.is_absolute() or '..' in relative.parts or '\\' in str(relative):
                raise SystemExit('Unsafe archive path')
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise SystemExit('Archive symlink rejected')
            if not is_source(relative) or relative.suffix.lower() in ('.zip','.tar','.gz'):
                continue
            if not included('demos/local-fan-v8/'+relative.as_posix()):
                continue
            content=archive.read(info)
            target=DEMO_TARGET/Path(*relative.parts)
            expected=hashlib.sha256(content).hexdigest()
            if target.exists() and digest(target)!=expected:
                raise SystemExit('Demo candidate independently edited: '+str(relative))
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(content)
            selected.append({'path':target.relative_to(ROOT).as_posix(),'bytes':len(content),'sha256':expected})
    if not selected and included('demos/local-fan-v8/index.html'):
        raise SystemExit('Representative v8 demo not found')
    provenance['GB_WEB.zip']={'bytes':archive_path.stat().st_size,'sha256':digest(archive_path),
        'selected_prefix':LEGACY,'selected_files':selected,
        'archive_groups':dict(sorted(groups.items()))}
    (ROOT/'demos/provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def group_for(name):
    # The UI is committed first, so byte-preservation rules must accompany it.
    if name == '.gitattributes' or name.startswith('demos/'):
        return '01-ui-demos'
    if name.startswith('app/gb-system/app/'):
        sub=name[len('app/gb-system/app/'):]
        if sub.startswith(('css/','js/','assets/')) or sub in ('index.html','manifest.webmanifest','sw.js','experience.webmanifest','experience-sw.js'):
            return '01-ui-demos'
        if (sub.endswith('.py') and not sub.startswith('tests/')) or sub.startswith('data/') or sub=='requirements.txt':
            return '02-server-workflows'
    return '03-deploy-validation'


def write_groups():
    names=[]
    for folder in (TARGET,ROOT/'demos',DOCS):
        for path in folder.rglob('*'):
            if not path.is_file():
                continue
            if folder==DOCS:
                if 'manifests' in path.relative_to(DOCS).parts:
                    continue
            elif not is_source(path):
                continue
            name=path.relative_to(ROOT).as_posix()
            if included(name):
                names.append(name)
    names += ['.gitattributes','.gitignore','tools/prepare_final_pr.py','tools/validate_final_pr.py']
    names += [f'docs/final-pr/manifests/{group}.txt' for group in
              ('01-ui-demos','02-server-workflows','03-deploy-validation')]
    groups=defaultdict(list)
    for name in sorted(set(names)):
        groups[group_for(name)].append(name)
    (DOCS/'manifests').mkdir(exist_ok=True)
    for group,names in groups.items():
        (DOCS/'manifests'/f'{group}.txt').write_text('\n'.join(names)+'\n',encoding='utf-8')
    print(json.dumps({group:{'files':len(names),'bytes':sum((ROOT/name).stat().st_size for name in names)}
                      for group,names in groups.items()},ensure_ascii=False,indent=2))


def check():
    saved=json.loads(MANIFEST.read_text(encoding='utf-8'))['files']
    # Teammates receive the final sources, not the ignored working previews.
    # Still compare to the working source whenever it exists on this PC.
    source_available=(SOURCE/'app').is_dir()
    current=source_manifest() if source_available else saved
    drift=[name for name in sorted(set(saved)|set(current)) if saved.get(name)!=current.get(name)]
    altered=[name for name,item in saved.items() if not (TARGET/name).is_file() or digest(TARGET/name)!=item['sha256']]
    manifest_paths=[]
    for path in sorted((DOCS/'manifests').glob('*.txt')):
        manifest_paths += path.read_text(encoding='utf-8').splitlines()
    assert len(manifest_paths)==len(set(manifest_paths)), 'PR groups overlap'
    for name in manifest_paths:
        path=PurePosixPath(name)
        if (path.is_absolute() or '..' in path.parts or path.parts[0] in ('outputs','tmp')
                or not is_source(path) or not included(name) or path.suffix.lower() in ('.zip','.tar','.gz')):
            raise SystemExit('Non-source or unsafe PR path: '+name)
        if not (ROOT/name).is_file():
            raise SystemExit('Missing PR candidate: '+name)
    # One Git process avoids hundreds of slow process launches on Windows.
    result=subprocess.run(['git','check-ignore','--stdin','-z'],cwd=ROOT,
                          input='\0'.join(manifest_paths)+'\0',capture_output=True,text=True,
                          encoding='utf-8',errors='replace')
    if result.returncode not in (0,1):
        raise SystemExit('Git ignore check failed: '+result.stderr)
    ignored=[name for name in result.stdout.split('\0') if name]
    result={'source_files':len(saved),'working_source_available':source_available,'source_drift':drift,'candidate_edits':altered,
            'ignored_candidates':ignored,'pr_files':len(manifest_paths),'passed':not(drift or altered or ignored)}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if not result['passed']:
        raise SystemExit(1)


def package_groups():
    # Packages contain only the reviewed path lists, never the working outputs/.
    # Verify every entry against the current candidate after writing the ZIP.
    check()
    validation=json.loads((DOCS/'validation.json').read_text(encoding='utf-8'))
    if not validation['passed'] or validation.get('source_manifest_sha256')!=digest(MANIFEST):
        raise SystemExit('Run tools/validate_final_pr.py on the current source before packaging')
    output=ROOT/'outputs/final-pr-preparation-20261025/packages'
    output.mkdir(parents=True,exist_ok=True)
    packages=[]
    for manifest in sorted((DOCS/'manifests').glob('*.txt')):
        names=manifest.read_text(encoding='utf-8').splitlines()
        expected={name:digest(ROOT/name) for name in names}
        archive=output/f'PR-review-{manifest.stem}-slim.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as bundle:
            for name in names:
                bundle.write(ROOT/name,name)
        with zipfile.ZipFile(archive) as bundle:
            assert set(bundle.namelist())==set(names)
            assert bundle.testzip() is None
            assert all(hashlib.sha256(bundle.read(name)).hexdigest()==sha for name,sha in expected.items())
        packages.append({'group':manifest.stem,'path':archive.relative_to(ROOT).as_posix(),
                         'files':len(names),'bytes':archive.stat().st_size,'sha256':digest(archive)})
    (output/'packages.json').write_text(json.dumps(packages,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'STATUS.txt').write_text(
        '현재 파일 목록·원본 해시·정적/회귀 검증을 통과한 PR 검토용 ZIP입니다.\n'
        '중복 정리 후 -slim.zip을 사용합니다. 이전 231/23/71개 파일 ZIP은 사용하지 않습니다.\n'
        '01 묶음: 화면 PR #30 병합 완료 / 02·03 묶음: 본인의 기존 PR #31에 두 커밋으로 통합 / 리뷰·병합: 팀장님\n'
        '02·03 ZIP은 같은 feat/KMJ에 반영합니다. outputs/ 및 ZIP 자체는 커밋하지 않습니다.\n'
        '추가 소스 변경이나 재배포가 있으면 후보 갱신·검증·ZIP 생성을 다시 수행하세요.\n',encoding='utf-8')
    print(json.dumps(packages,ensure_ascii=False,indent=2))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--package',action='store_true',help='Build three review ZIPs from the current manifests')
    parser.add_argument('--demo-dir',type=Path)
    args=parser.parse_args()
    if args.check:
        check()
        return
    if args.package:
        package_groups()
        return
    copy_sources()
    if args.demo_dir:
        import_demos(args.demo_dir)
    write_groups()


if __name__=='__main__':
    main()

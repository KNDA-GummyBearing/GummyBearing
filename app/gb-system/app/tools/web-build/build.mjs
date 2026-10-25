// Build only: the deployed Python server requires neither Node nor esbuild.
import * as esbuild from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const tool=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(tool,'../..');
const check=process.argv.includes('--check');
const hash=data=>createHash('sha256').update(data).digest('hex');
const styles=JSON.parse(await readFile(path.join(tool,'styles.json'),'utf8'));
if (!styles.length || styles.some(name=>!/^[-a-z0-9]+\.css$/.test(name))) throw Error('Invalid stylesheet list');
const options={absWorkingDir:root,bundle:true,write:false,metafile:true,minify:false,
  legalComments:'inline',charset:'utf8',logLevel:'silent'};
const js=await esbuild.build({...options,entryPoints:['js/app.js'],outfile:'js/bundle.js',format:'esm',
  platform:'browser',target:'es2022',treeShaking:false});
const css=await esbuild.build({...options,stdin:{contents:styles.map(name=>`@import "./${name}";`).join('\n'),
  resolveDir:path.join(root,'css'),sourcefile:'site-entry.css',loader:'css'},outfile:'css/bundle.css',
  external:['../assets/*','data:*']});
if (js.warnings.length || css.warnings.length) throw Error(JSON.stringify([...js.warnings,...css.warnings]));
if(js.outputFiles.length!==1 || css.outputFiles.length!==1) throw Error('Expected one JS and one CSS bundle');
const jsBody=js.outputFiles[0].contents, cssBody=css.outputFiles[0].contents;
const jsName=`js/app.${hash(jsBody).slice(0,16)}.js`;
const cssName=`css/site.${hash(cssBody).slice(0,16)}.css`;
const sourceNames=[...new Set([...Object.keys(js.metafile.inputs),...Object.keys(css.metafile.inputs)]
  .filter(name=>!name.endsWith('site-entry.css')))];
sourceNames.push('tools/web-build/styles.json','tools/web-build/build.mjs','tools/web-build/package.json');
const sources=Object.fromEntries(await Promise.all(sourceNames.sort().map(async name=>[name,hash(await readFile(path.join(root,name)))])));
const manifest=JSON.stringify({builder:`esbuild@${esbuild.version}`,javascript:jsName,stylesheet:cssName,
  files:{[jsName]:hash(jsBody),[cssName]:hash(cssBody)},sources},null,2)+'\n';
let html=await readFile(path.join(root,'index.html'),'utf8');
const linkPattern=/<link\s+rel="stylesheet"\s+href="css\/[^"]+"\s*>/g;
const links=[...html.matchAll(linkPattern)];
const linkedNames=links.map(match=>match[0].match(/href="css\/([^"]+)"/)[1]);
const isBuilt=linkedNames.length===1 && /^site\.[a-f0-9]{16}\.css$/.test(linkedNames[0]);
if(!isBuilt && JSON.stringify(linkedNames)!==JSON.stringify(styles)) throw Error('HTML stylesheet order differs from styles.json');
let first=true;
html=html.replace(linkPattern,()=>{if(!first)return '';first=false;return `<link rel="stylesheet" href="${cssName}">`;});
const scriptPattern=/<script type="module" src="js\/app(?:\.[a-f0-9]{16})?\.js"><\/script>/g;
if([...html.matchAll(scriptPattern)].length!==1) throw Error('Expected one module entry in index.html');
html=html.replace(scriptPattern,`<script type="module" src="${jsName}"></script>`);
const outputs=new Map([[jsName,jsBody],[cssName,cssBody],['js/build-manifest.json',manifest],['index.html',html]]);
for(const [name,body] of outputs){
  if(check){
    let current;try{current=await readFile(path.join(root,name));}catch{throw Error('Missing generated file: '+name);}
    if(!current.equals(Buffer.from(body)))throw Error('Stale generated file: '+name+'; run the build again');
  }else await writeFile(path.join(root,name),body);
}
console.log(JSON.stringify({checked:check,javascript:jsName,stylesheet:cssName,sourceFiles:sourceNames.length,
  javascriptBytes:jsBody.length,stylesheetBytes:cssBody.length}));

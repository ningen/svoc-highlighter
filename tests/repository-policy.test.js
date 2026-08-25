const fs=require('fs');const path=require('path');
let checks=0,pass=0;const failures=[];
function check(name,value){checks++;if(value)pass++;else failures.push(name);}
const root=path.resolve(__dirname,'..');
const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
check('benchmark cache is gitignored',ignore.includes('benchmark/cache/*'));
const sources=JSON.parse(fs.readFileSync(path.join(root,'benchmark/sources.json'),'utf8'));
check('external allowlist empty by default',Array.isArray(sources)&&sources.length===0);
const workflow=fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8');
check('release does not run external benchmark fetcher',!workflow.includes('benchmark:fetch'));
check('release package excludes benchmark directory',!workflow.match(/zip[^\n]*benchmark\//));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
check('dom extractor loaded before content runtime',manifest.content_scripts[0].js.indexOf('dom-extractor.js') < manifest.content_scripts[0].js.indexOf('content.js'));
console.log(`Repository policy: ${pass}/${checks} checks passed`);
if(failures.length){for(const f of failures)console.error(`FAIL ${f}`);process.exitCode=1;}

const fs=require('fs');const path=require('path');
let checks=0,pass=0;const failures=[];
function check(name,value){checks++;if(value)pass++;else failures.push(name);}
const root=path.resolve(__dirname,'..');
const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
check('local benchmark source list is gitignored',ignore.includes('benchmark/sources.local.json'));
const sources=JSON.parse(fs.readFileSync(path.join(root,'benchmark/sources.json'),'utf8'));
check('external allowlist remains empty by default',Array.isArray(sources)&&sources.length===0);
const example=JSON.parse(fs.readFileSync(path.join(root,'benchmark/sources.example.json'),'utf8'));
check('example sources require explicit terms review',example.length>0&&example.every(source=>source.termsReviewed!==true));
check('example sources use HTTPS',example.every(source=>new URL(source.url).protocol==='https:'));
check('example sources cover diverse hosts',new Set(example.map(source=>new URL(source.url).hostname)).size>=3);
const workflow=fs.readFileSync(path.join(root,'.github/workflows/release.yml'),'utf8');
check('release does not run benchmark evaluator',!workflow.includes('benchmark:run'));
const runner=fs.readFileSync(path.join(root,'tools/run-benchmark.mjs'),'utf8');
const forbidden=[/\bfetch\s*\(/,/node:http/,/node:https/,/https:\/\//];
check('benchmark evaluator has no network API',forbidden.every(pattern=>!pattern.test(runner)));
console.log(`Benchmark policy: ${pass}/${checks} checks passed`);
if(failures.length){for(const failure of failures)console.error(`FAIL ${failure}`);process.exitCode=1;}

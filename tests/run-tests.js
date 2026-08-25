const fs=require('fs');const path=require('path');const parser=require('../parser.js');
const corpus=JSON.parse(fs.readFileSync(path.join(__dirname,'corpus.json'),'utf8'));
const regression=JSON.parse(fs.readFileSync(path.join(__dirname,'diagnostics-regression.json'),'utf8'));
const gold=JSON.parse(fs.readFileSync(path.join(__dirname,'gold-corpus.json'),'utf8'));
let checks=0,pass=0;const failures=[];
function checkOne(c,r,text){const got={};for(const x of r.ranges||[])got[x.role]=text.slice(x.start,x.end);if(c.skip){checks++;if(!(r.ranges||[]).length)pass++;else failures.push({text,role:'skip',expected:'no ranges',got:JSON.stringify(got),rule:r.ruleId});return;}for(const role of ['s','v','o','c','m']){if(c[role]!==undefined){checks++;if(got[role]===c[role])pass++;else failures.push({text,role,expected:c[role],got:got[role]||null,confidence:r.confidence,rule:r.ruleId});}}}
for(const c of corpus){const r=c.m!==undefined?parser.analyze(c.text).sentences[0]:parser.analyzeSentence(c.text,0);checkOne(c,r,c.text);}
for(const c of gold){const r=c.m!==undefined||c.fullAnalysis===true?parser.analyze(c.text).sentences[0]:parser.analyzeSentence(c.text,0);checkOne(c,r,c.text);}
for(const c of regression){if(c.multi){const rr=parser.analyze(c.text).sentences;checks++;if(rr.length===c.multi.length)pass++;else failures.push({text:c.text,role:'clause-count',expected:c.multi.length,got:rr.length});for(let i=0;i<Math.min(rr.length,c.multi.length);i++)checkOne(c.multi[i],{...rr[i],ranges:rr[i].ranges},rr[i].text);}else checkOne(c,parser.analyzeSentence(c.text,0),c.text);}

const privacy=require('../privacy.js');
function privacyCheck(name,actual,expected){checks++;if(actual===expected)pass++;else failures.push({text:name,role:'privacy',expected:String(expected),got:String(actual),rule:'privacy'});}
privacyCheck('exact internal host',privacy.matchesHost('internal.example.com',['^internal\\.example\\.com$']),true);
privacyCheck('subdomain family',privacy.matchesHost('api.corp.example.com',['(^|\\.)corp\\.example\\.com$']),true);
privacyCheck('unrelated public host',privacy.matchesHost('example.com',['(^|\\.)corp\\.example\\.com$']),false);
privacyCheck('case insensitive',privacy.matchesHost('SECRET.Example.COM',['^secret\\.example\\.com$']),true);
privacyCheck('invalid regex detected',privacy.compile(['[broken']).invalid.length,1);
const filteredPrivacy=privacy.filterSamples([{host:'secret.example.com'},{host:'docs.example.com'}],['^secret\\.example\\.com$']);
privacyCheck('blacklisted samples purged',filteredPrivacy.length,1);
privacyCheck('safe sample retained',filteredPrivacy[0]?.host,'docs.example.com');

privacyCheck('exact-host regex escapes dots', privacy.matchesHost('docs.example.com',['^docs\\.example\\.com$']), true);
privacyCheck('exact-host regex does not match subdomain', privacy.matchesHost('api.docs.example.com',['^docs\\.example\\.com$']), false);

console.log(`SVOC corpus + human-reviewed gold corpus + diagnostics regression + privacy: ${pass}/${checks} checks passed (${(pass/checks*100).toFixed(1)}%)`);if(failures.length){for(const f of failures)console.log(`FAIL ${String(f.role).toUpperCase()} | ${f.text}\n  expected: ${f.expected}\n  got:      ${f.got}\n  rule:     ${f.rule||''}\n`);}process.exitCode=failures.length?1:0;

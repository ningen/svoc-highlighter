import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const USER_AGENT='SVOC-Highlighter-Benchmark/0.8 (+https://github.com/ningen/svoc-highlighter)';
const PRODUCT='svoc-highlighter-benchmark';
const MIN_DELAY_MS=2000;
const MAX_PAGES=20;
const sourceFile=path.resolve('benchmark/sources.json');
const cacheDir=path.resolve('benchmark/cache');
const sources=JSON.parse(await fs.readFile(sourceFile,'utf8'));
if(!Array.isArray(sources)) throw new Error('benchmark/sources.json must be an array');
if(sources.length>MAX_PAGES) throw new Error(`Refusing to fetch more than ${MAX_PAGES} pages per run`);
await fs.mkdir(cacheDir,{recursive:true});
let lastRequest=0; const robotsCache=new Map();
async function politeFetch(url,accept='text/plain,*/*'){
  const wait=Math.max(0,MIN_DELAY_MS-(Date.now()-lastRequest));
  if(wait) await new Promise(r=>setTimeout(r,wait));
  lastRequest=Date.now();
  return fetch(url,{redirect:'follow',headers:{'User-Agent':USER_AGENT,'Accept':accept}});
}
function patternMatches(pathname,pattern){
  if(!pattern) return false;
  const anchored=pattern.endsWith('$');
  if(anchored) pattern=pattern.slice(0,-1);
  const escaped=pattern.split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
  const re=new RegExp('^'+escaped+(anchored?'$':''));
  return re.test(pathname);
}
function robotsAllows(text,url){
  const lines=text.split(/\r?\n/).map(line=>line.replace(/\s*#.*$/,'').trim()).filter(Boolean);
  const groups=[]; let group=null; let seenRule=false;
  for(const line of lines){
    const m=line.match(/^([^:]+):\s*(.*)$/); if(!m) continue;
    const key=m[1].trim().toLowerCase(), value=m[2].trim();
    if(key==='user-agent'){
      if(!group||seenRule){group={agents:[],rules:[]};groups.push(group);seenRule=false;}
      group.agents.push(value.toLowerCase());
    } else if((key==='allow'||key==='disallow')&&group){
      group.rules.push({type:key,path:value});seenRule=true;
    }
  }
  const matching=groups.filter(g=>g.agents.some(a=>a==='*'||PRODUCT.startsWith(a)));
  if(!matching.length) return true;
  const best=Math.max(...matching.map(g=>Math.max(...g.agents.filter(a=>a==='*'||PRODUCT.startsWith(a)).map(a=>a==='*'?0:a.length))));
  const selected=matching.filter(g=>g.agents.some(a=>(a==='*'?0:a.length)===best&&(a==='*'||PRODUCT.startsWith(a))));
  const pathname=new URL(url).pathname+new URL(url).search;
  const rules=selected.flatMap(g=>g.rules).filter(r=>r.path&&patternMatches(pathname,r.path));
  if(!rules.length) return true;
  rules.sort((a,b)=>b.path.length-a.path.length || (a.type==='allow'?-1:1));
  return rules[0].type==='allow';
}
async function allowed(url){
  const u=new URL(url), robotsUrl=`${u.protocol}//${u.host}/robots.txt`;
  let text=robotsCache.get(robotsUrl);
  if(text===undefined){
    const res=await politeFetch(robotsUrl);
    // Conservative policy: if crawler preferences cannot be verified, do not fetch.
    if(!res.ok) throw new Error(`Cannot verify robots.txt for ${u.host}: HTTP ${res.status}`);
    text=await res.text();robotsCache.set(robotsUrl,text);
  }
  return robotsAllows(text,url);
}
for(const source of sources){
  if(!source?.url||source.termsReviewed!==true||!source.license) throw new Error('Every source needs url, license, and termsReviewed:true');
  const u=new URL(source.url);
  if(!['http:','https:'].includes(u.protocol)) throw new Error(`Unsupported protocol: ${u.protocol}`);
  if(u.username||u.password) throw new Error('Credentialed URLs are forbidden');
  if(!(await allowed(source.url))) throw new Error(`robots.txt disallows ${source.url}`);
  const res=await politeFetch(source.url,'text/html,application/xhtml+xml');
  if(!res.ok) throw new Error(`HTTP ${res.status}: ${source.url}`);
  const type=res.headers.get('content-type')||'';
  if(!type.includes('text/html')) throw new Error(`Not HTML: ${source.url} (${type})`);
  const html=await res.text();
  const id=crypto.createHash('sha256').update(source.url).digest('hex').slice(0,16);
  await fs.writeFile(path.join(cacheDir,`${id}.html`),html);
  await fs.writeFile(path.join(cacheDir,`${id}.json`),JSON.stringify({url:source.url,license:source.license,fetchedAt:new Date().toISOString()},null,2));
  console.log(`cached ${u.hostname} -> ${id}.html`);
}

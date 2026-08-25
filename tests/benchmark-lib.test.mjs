import assert from 'node:assert/strict';
import { collectSuspicious, extractPayload, renderMarkdown, summarize } from '../tools/lib/benchmark-lib.mjs';

let checks=0;
function check(name,run){
  run();checks++;
  console.log(`PASS ${name}`);
}

check('extractPayload decodes serialized entities',()=>{
  const dump='<html><body><pre id="svoc-extract-result">{&quot;blocks&quot;:[{&quot;text&quot;:&quot;A &lt; B &amp; C &#39;quoted&#39; &lt;/pre&gt;&quot;}],&quot;extractionMs&quot;:2}</pre></body></html>';
  assert.deepEqual(extractPayload(dump),{blocks:[{text:"A < B & C 'quoted' </pre>"}],extractionMs:2});
});

check('summarize calculates coverage and processing metrics',()=>{
  const pages=[
    {status:'ok',parseMs:6,extractionMs:4,maxBlockMs:5},
    {status:'error',parseMs:0,extractionMs:1,maxBlockMs:0}
  ];
  const records=[
    {text:'The task runs.',confidence:0.7,ruleId:'main.lexical',ranges:[{role:'s',start:0,end:8}]},
    {text:'At least quarterly.',confidence:0.1,ruleId:'skip.fragment',ranges:[]},
    {text:'The option that works is enabled.',confidence:0.9,ruleId:'main.relative-aware',ranges:[{role:'s',start:0,end:20}]}
  ];
  const summary=summarize(pages,records);
  assert.equal(summary.totalPages,2);
  assert.equal(summary.successfulPages,1);
  assert.equal(summary.totalExtractedSentences,3);
  assert.equal(summary.highlighted,2);
  assert.equal(summary.skipped,1);
  assert.equal(summary.ruleCounts['main.relative-aware'],1);
  assert.equal(summary.processingTime.totalParseMs,6);
  assert.equal(summary.processingTime.averageMsPerSentence,2);
  assert.equal(summary.processingTime.maxBlockMs,5);
  assert.equal(summary.processingTime.totalExtractionMs,5);
});

check('collectSuspicious detects benchmark review buckets',()=>{
  const longText=Array.from({length:25},(_,index)=>`word${index}`).join(' ');
  const records=[
    {text:longText,confidence:0.8,ruleId:'main.lexical',ranges:[]},
    {text:'Overlap sample.',confidence:0.8,ruleId:'main.lexical',ranges:[{role:'s',start:0,end:7},{role:'v',start:6,end:10}]},
    {text:'Modifier area.',confidence:0.8,ruleId:'main.lexical',ranges:[{role:'m',start:0,end:7}]},
    {text:'Weak parse.',confidence:0.5,ruleId:'main.lexical',ranges:[{role:'v',start:5,end:10}]}
  ];
  records.push(
    {text:'The option that works stays enabled.',confidence:0.8,ruleId:'main.relative-aware',ranges:[{role:'s',start:0,end:20}]},
    {text:'Unsupported fragment sample.',confidence:0.15,ruleId:'skip.no-main-verb',ranges:[]}
  );
  const suspicious=collectSuspicious(records,{longMultiClause:1,relativeAware:1,skipNoMainVerb:1,overlappingRanges:1,mHeavy:1,lowConfidenceHighlighted:1});
  assert.equal(suspicious.longMultiClause.total,1);
  assert.equal(suspicious.relativeAware.total,1);
  assert.equal(suspicious.skipNoMainVerb.total,1);
  assert.equal(suspicious.overlappingRanges.total,1);
  assert.equal(suspicious.mHeavy.total,1);
  assert.equal(suspicious.lowConfidenceHighlighted.total,1);
  assert.equal(suspicious.overlappingRanges.items[0].text,'Overlap sample.');
});

check('renderMarkdown includes required report sections',()=>{
  const records=[{text:'The task runs.',confidence:0.7,ruleId:'main.lexical',ranges:[{role:'v',start:9,end:13}]}];
  const report={generatedAt:'2026-08-26T00:00:00.000Z',summary:summarize([{status:'ok'}],records),suspicious:collectSuspicious(records)};
  const markdown=renderMarkdown(report);
  assert.match(markdown,/Confidence distribution/);
  assert.match(markdown,/Rule counts/);
  assert.match(markdown,/Overlapping ranges/);
});

console.log(`Benchmark library: ${checks}/${checks} checks passed`);

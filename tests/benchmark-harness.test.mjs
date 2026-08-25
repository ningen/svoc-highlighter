import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { extractPayload } from '../tools/lib/benchmark-lib.mjs';

const dumpFile=process.argv[2];
if(!dumpFile) throw new Error('Usage: node tests/benchmark-harness.test.mjs <dump-file>');
const payload=extractPayload(await fs.readFile(dumpFile,'utf8'));
if(payload.error) throw new Error(payload.error);
assert.ok(Array.isArray(payload.blocks),'harness returns blocks');
assert.ok(payload.blocks.some(block=>block.text.trim()==='Set minimumReleaseAge to 3 days for stable dependencies.'),'inline code text is preserved');
assert.ok(payload.blocks.some(block=>block.text.includes('Real documentation text is visible.')),'ordinary documentation text is extracted');
assert.ok(payload.blocks.every(block=>!block.text.includes('Navigation should not be parsed.')),'navigation is excluded');
assert.ok(payload.blocks.every(block=>!block.text.includes('const x = 1')),'preformatted code is excluded');
assert.ok(payload.blocks.every(block=>block.tag==='P'),'fixture blocks retain their tag name');
console.log(`Benchmark harness: ${payload.blocks.length} synthetic blocks extracted (headless Chromium)`);

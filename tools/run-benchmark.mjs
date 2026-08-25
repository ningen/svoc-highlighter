import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectSuspicious, extractPayload, renderMarkdown, summarize } from './lib/benchmark-lib.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harnessPath = path.join(root, 'benchmark/harness.html');
const parser = createRequire(import.meta.url)(path.join(root, 'parser.js'));

function parseArgs(argv) {
  const options = {
    cache: path.join(root, 'benchmark/cache'),
    out: path.join(root, 'benchmark/output'),
    limit: 200,
    browser: process.env.CHROME_BIN || ''
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--cache' || flag === '--out' || flag === '--limit' || flag === '--browser') {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${flag}`);
      if (flag === '--cache') options.cache = path.resolve(value);
      else if (flag === '--out') options.out = path.resolve(value);
      else if (flag === '--browser') options.browser = path.resolve(value);
      else {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
        options.limit = limit;
      }
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return options;
}

async function executable(file) {
  try {
    await fs.access(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findBrowser(explicit) {
  if (explicit) {
    if (await executable(explicit)) return explicit;
    throw new Error(`Browser is not executable: ${explicit}`);
  }
  const candidates = ['chromium', 'google-chrome', 'google-chrome-stable', 'chromium-browser'];
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const candidate of candidates) {
    for (const dir of pathDirs) {
      const file = path.join(dir, candidate);
      if (await executable(file)) return file;
    }
  }
  throw new Error('No Chromium/Chrome executable found; pass --browser or set CHROME_BIN');
}

function assertHarnessPayload(payload) {
  if (typeof payload.error === 'string' && payload.error) throw new Error(payload.error);
  if (!Array.isArray(payload.blocks)) throw new Error('Benchmark harness payload has no blocks array');
  for (const block of payload.blocks) {
    if (!block || typeof block.tag !== 'string' || typeof block.text !== 'string') throw new Error('Benchmark harness returned an invalid block');
  }
  return payload;
}

async function readMetadata(cacheDir, htmlFile) {
  const base = htmlFile.slice(0, -'.html'.length);
  const metadataFile = path.join(cacheDir, `${base}.json`);
  try {
    const metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
    if (!metadata || typeof metadata.url !== 'string') throw new Error('metadata url is missing');
    if (typeof metadata.license !== 'string' || !metadata.license) throw new Error('metadata license is missing');
    const url = new URL(metadata.url);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('metadata url must be HTTP(S)');
    return { metadata, host: url.hostname.toLowerCase() };
  } catch (error) {
    throw new Error(`Cannot use ${htmlFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function extractPage(browser, htmlPath, host) {
  const harnessUrl = pathToFileURL(harnessPath);
  harnessUrl.searchParams.set('file', htmlPath);
  harnessUrl.searchParams.set('host', host);
  const { stdout } = await execFileAsync(browser, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--allow-file-access-from-files',
    '--dump-dom',
    '--virtual-time-budget=10000',
    harnessUrl.href
  ], { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  return assertHarnessPayload(extractPayload(stdout));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.cache, { recursive: true });
  await fs.mkdir(options.out, { recursive: true });

  const entries = await fs.readdir(options.cache, { withFileTypes: true });
  const htmlFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => entry.name)
    .sort()
    .slice(0, options.limit);

  const prepared = [];
  const pages = [];
  for (const htmlFile of htmlFiles) {
    try {
      const { metadata, host } = await readMetadata(options.cache, htmlFile);
      prepared.push({ htmlFile, metadata, host });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`warning: ${message}`);
      pages.push({ file: htmlFile, status: 'error', error: message, extractionMs: 0, parseMs: 0, maxBlockMs: 0 });
    }
  }

  const browser = prepared.length ? await findBrowser(options.browser) : '';
  const records = [];
  for (const item of prepared) {
    const pageRecords = [];
    const page = {
      file: item.htmlFile,
      url: item.metadata.url,
      host: item.host,
      status: 'ok',
      extractedBlocks: 0,
      extractedSentences: 0,
      extractionMs: 0,
      parseMs: 0,
      maxBlockMs: 0
    };
    try {
      const payload = await extractPage(browser, path.join(options.cache, item.htmlFile), item.host);
      page.extractedBlocks = payload.blocks.length;
      page.extractionMs = Number.isFinite(payload.extractionMs) ? payload.extractionMs : 0;
      for (const block of payload.blocks) {
        const result = parser.analyze(block.text);
        const blockDuration = Number.isFinite(result.durationMs) ? result.durationMs : 0;
        page.parseMs += blockDuration;
        page.maxBlockMs = Math.max(page.maxBlockMs, blockDuration);
        for (const sentence of result.sentences) {
          pageRecords.push({
            url: item.metadata.url,
            host: item.host,
            blockTag: block.tag,
            text: sentence.text,
            confidence: sentence.confidence,
            ruleId: sentence.ruleId,
            reasons: sentence.reasons,
            ranges: sentence.ranges,
            durationMs: blockDuration
          });
          page.extractedSentences++;
        }
      }
      records.push(...pageRecords);
    } catch (error) {
      page.status = 'error';
      page.error = error instanceof Error ? error.message : String(error);
      console.warn(`warning: ${item.htmlFile}: ${page.error}`);
    }
    pages.push(page);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: parser.VERSION,
    summary: summarize(pages, records),
    suspicious: collectSuspicious(records, 200),
    pages,
    records
  };
  await fs.writeFile(path.join(options.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(options.out, 'report.md'), renderMarkdown(report));
  console.log(`Benchmark: ${report.summary.successfulPages}/${report.summary.totalPages} pages, ${report.summary.totalExtractedSentences} sentences`);
  console.log(`Reports: ${path.join(options.out, 'report.json')} and ${path.join(options.out, 'report.md')}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

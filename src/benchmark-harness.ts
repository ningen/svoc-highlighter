import { collectCandidateBlocks, collectText } from './dom-extractor.ts';
import { isEnglishSentence } from './parser.ts';

interface HarnessBlock {
  readonly tag: string;
  readonly text: string;
}

interface HarnessPayload {
  readonly blocks?: HarnessBlock[];
  readonly extractionMs?: number;
  readonly error?: string;
}

function publish(payload: HarnessPayload): void {
  const pre = document.createElement('pre');
  pre.id = 'svoc-extract-result';
  pre.textContent = JSON.stringify(payload);
  document.body.append(pre);
}

function englishLike(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(trimmed)) return false;
  const letters = (text.match(/[A-Za-z]/g) || []).length;
  return letters >= 5 && letters / Math.max(text.length, 1) > 0.32 && isEnglishSentence(text);
}

try {
  const params = new URL(location.href).searchParams;
  const file = params.get('file');
  const host = params.get('host') || '';
  if (!file) throw new Error('Missing file query parameter');

  const started = performance.now();
  const xhr = new XMLHttpRequest();
  xhr.open('GET', file.startsWith('file:') ? file : `file://${file}`, false);
  xhr.send();
  if (xhr.status !== 0 && xhr.status !== 200) {
    throw new Error(`Cannot read benchmark file: status ${xhr.status}`);
  }

  const doc = new DOMParser().parseFromString(xhr.responseText, 'text/html');
  const root = doc.body || doc.documentElement;
  const blocks = collectCandidateBlocks(root, host)
    .map((block) => ({ tag: block.tagName, text: collectText(block, doc).text }))
    .filter((block) => englishLike(block.text));

  publish({ blocks, extractionMs: Math.max(0, performance.now() - started) });
} catch (error: unknown) {
  publish({ error: error instanceof Error ? error.message : String(error) });
}

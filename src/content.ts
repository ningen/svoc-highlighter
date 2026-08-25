import * as SVOCDom from './dom-extractor.ts';
import type { CollectedText } from './dom-extractor.ts';
import * as SVOCParser from './parser.ts';
import type { AnalysisResult, ParserRange } from './parser.ts';
import * as SVOCPrivacy from './privacy.ts';
import { readHostStats, readSamples, readStats } from './storage.ts';
import type { DiagnosticSample, HostCount } from './storage.ts';

const MAX_SAMPLES = 200;

interface PendingStats {
  processed: number;
  highlighted: number;
  lowConfidence: number;
  totalConfidence: number;
  totalMs: number;
  ruleCounts: Record<string, number>;
  hostCounts: Record<string, HostCount>;
}

function emptyPendingStats(): PendingStats {
  return {
    processed: 0,
    highlighted: 0,
    lowConfidence: 0,
    totalConfidence: 0,
    totalMs: 0,
    ruleCounts: {},
    hostCounts: {},
  };
}

async function bootstrap(): Promise<void> {
  const stored = await chrome.storage.local.get({ enabled: true, diagnosticsBlacklist: [] });
  if (!Boolean(stored.enabled) || SVOCPrivacy.matchesHost(location.hostname, stored.diagnosticsBlacklist)) return;
  startHighlighter();
}

function startHighlighter(): void {
  let enabled = true;
  const observed = new Set<Element>();
  let pendingStats = emptyPendingStats();
  let statsTimer: ReturnType<typeof setTimeout> | null = null;

  const observer = new IntersectionObserver((entries) => {
    if (!enabled) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      highlightBlock(entry.target);
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '350px 0px' });

  function englishLike(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 8) return false;
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(trimmed)) return false;
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return letters >= 5 && letters / Math.max(text.length, 1) > 0.32 && SVOCParser.isEnglishSentence(text);
  }

  function applyRanges(model: CollectedText, ranges: ParserRange[]): void {
    const sorted = [...ranges].sort((a, b) => b.start - a.start);
    for (const range of sorted) {
      for (let index = model.nodes.length - 1; index >= 0; index--) {
        const item = model.nodes[index];
        if (!item) continue;
        const from = Math.max(range.start, item.start);
        const to = Math.min(range.end, item.end);
        if (from >= to || !item.node.isConnected) continue;
        const value = item.node.nodeValue || '';
        const before = value.slice(0, from - item.start);
        const middle = value.slice(from - item.start, to - item.start);
        const after = value.slice(to - item.start);
        const fragment = document.createDocumentFragment();
        if (before) fragment.append(document.createTextNode(before));
        const span = document.createElement('span');
        span.className = `svoc-${range.role}`;
        span.setAttribute(SVOCDom.ATTR, range.role);
        span.textContent = middle;
        fragment.append(span);
        if (after) fragment.append(document.createTextNode(after));
        const replacementNodes = [...fragment.childNodes];
        item.node.replaceWith(fragment);
        item.node = replacementNodes.find((node): node is Text => node.nodeType === Node.TEXT_NODE)
          ?? document.createTextNode('');
        item.end = item.start + (item.node.nodeValue || '').length;
      }
    }
  }

  function queueStats(result: AnalysisResult): void {
    for (const sentence of result.sentences) {
      pendingStats.processed++;
      if (sentence.ranges.length) pendingStats.highlighted++;
      if (sentence.confidence < 0.65) pendingStats.lowConfidence++;
      pendingStats.totalConfidence += sentence.confidence || 0;
      const rule = sentence.ruleId || 'unknown';
      pendingStats.ruleCounts[rule] = (pendingStats.ruleCounts[rule] || 0) + 1;
      const host = location.hostname.toLowerCase();
      const hostEntry = pendingStats.hostCounts[host] || { processed: 0, highlighted: 0 };
      hostEntry.processed++;
      if (sentence.ranges.length) hostEntry.highlighted++;
      pendingStats.hostCounts[host] = hostEntry;
    }
    pendingStats.totalMs += result.durationMs || 0;
    statsTimer ??= setTimeout(() => void flushStats(), 800);
  }

  async function flushStats(): Promise<void> {
    statsTimer = null;
    const delta = pendingStats;
    pendingStats = emptyPendingStats();
    if (!delta.processed) return;
    const stored = await chrome.storage.local.get(['svocStats', 'svocHostStats']);
    const stats = readStats(stored.svocStats);
    const ruleCounts = { ...stats.ruleCounts };
    for (const [rule, count] of Object.entries(delta.ruleCounts)) {
      ruleCounts[rule] = (ruleCounts[rule] || 0) + count;
    }
    const hostStats = readHostStats(stored.svocHostStats);
    for (const [host, count] of Object.entries(delta.hostCounts)) {
      const previous = hostStats[host] || { processed: 0, highlighted: 0 };
      hostStats[host] = {
        processed: previous.processed + count.processed,
        highlighted: previous.highlighted + count.highlighted,
        updatedAt: Date.now(),
      };
    }
    await chrome.storage.local.set({
      svocHostStats: hostStats,
      svocStats: {
        processed: stats.processed + delta.processed,
        highlighted: stats.highlighted + delta.highlighted,
        lowConfidence: stats.lowConfidence + delta.lowConfidence,
        totalConfidence: stats.totalConfidence + delta.totalConfidence,
        totalMs: stats.totalMs + delta.totalMs,
        ruleCounts,
        parserVersion: SVOCParser.VERSION,
        updatedAt: Date.now(),
      },
    });
  }

  async function storeSamples(result: AnalysisResult, block: Element): Promise<void> {
    const candidates: DiagnosticSample[] = result.sentences
      .filter((sentence) => sentence.text.length <= 360
        && (sentence.ranges.length || ['skip.fragment', 'skip.no-main-verb'].includes(sentence.ruleId)))
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, 3)
      .map((sentence) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sentence: sentence.text,
        confidence: sentence.confidence,
        reasons: sentence.reasons,
        ruleId: sentence.ruleId,
        ranges: sentence.ranges,
        host: location.hostname,
        createdAt: Date.now(),
        elementTag: block.tagName.toLowerCase(),
        elementRole: block.getAttribute('role'),
      }));
    if (!candidates.length) return;
    const stored = await chrome.storage.local.get('svocSamples');
    const dedupe = new Map<string, DiagnosticSample>();
    for (const sample of [...candidates, ...readSamples(stored.svocSamples)]) {
      const key = `${sample.host}|${sample.sentence}`;
      if (!dedupe.has(key)) dedupe.set(key, sample);
    }
    await chrome.storage.local.set({ svocSamples: [...dedupe.values()].slice(0, MAX_SAMPLES) });
  }

  function highlightBlock(block: Element): void {
    if (!enabled || block.closest(SVOCDom.SKIP_SELECTOR) || !SVOCDom.leafBlock(block)
      || SVOCDom.looksLikeSearchResultUi(block, location.hostname)) return;
    const model = SVOCDom.collectText(block);
    if (!englishLike(model.text)) return;
    const result = SVOCParser.analyze(model.text);
    queueStats(result);
    void storeSamples(result, block);
    if (result.ranges.length) applyRanges(model, result.ranges);
  }

  function scan(root: Document | Element = document): void {
    if (!enabled) return;
    for (const block of SVOCDom.collectCandidateBlocks(root, location.hostname)) {
      if (observed.has(block)) continue;
      observed.add(block);
      observer.observe(block);
    }
  }

  function removeHighlights(): void {
    observer.disconnect();
    observed.clear();
    document.querySelectorAll(`[${SVOCDom.ATTR}]`).forEach((span) => {
      span.replaceWith(document.createTextNode(span.textContent || ''));
    });
    document.body?.normalize();
  }

  const mutationObserver = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && !node.closest(`[${SVOCDom.ATTR}]`)) scan(node);
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enabled) return;
    enabled = Boolean(changes.enabled.newValue);
    if (enabled) scan(); else removeHighlights();
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)
      || message.type !== 'SVOC_SET_ENABLED') return;
    enabled = 'enabled' in message && Boolean(message.enabled);
    if (enabled) scan(); else removeHighlights();
  });

  scan();
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
}

void bootstrap();

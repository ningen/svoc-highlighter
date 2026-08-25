(() => {
  'use strict';

  const { ATTR, BLOCK_SELECTOR, SKIP_SELECTOR } = SVOCDom;
  const MAX_SAMPLES = 200;

  async function bootstrap() {
    const { enabled = true, diagnosticsBlacklist = [] } = await chrome.storage.local.get({
      enabled: true,
      diagnosticsBlacklist: []
    });

    // Site exclusion is checked before any DOM scanning, observers, parsing,
    // highlighting, or diagnostics collection starts. Changes take effect after reload.
    if (!enabled || SVOCPrivacy.matchesHost(location.hostname, diagnosticsBlacklist)) return;

    startHighlighter();
  }

  function startHighlighter() {
    let enabled = true;
    const observed = new Set();
    let pendingStats = {
      processed: 0,
      highlighted: 0,
      lowConfidence: 0,
      totalConfidence: 0,
      totalMs: 0,
      ruleCounts: {},
      hostCounts: {}
    };
    let statsTimer = null;

    const observer = new IntersectionObserver(entries => {
      if (!enabled) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        highlightBlock(entry.target);
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '350px 0px' });

    function englishLike(text) {
      const trimmed = text.trim();
      if (trimmed.length < 8) return false;
      if (/^(?:https?:\/\/|www\.)\S+$/i.test(trimmed)) return false;
      const letters = (text.match(/[A-Za-z]/g) || []).length;
      return letters >= 5 && letters / Math.max(text.length, 1) > 0.32 && SVOCParser.isEnglishSentence(text);
    }

    function applyRanges(model, ranges) {
      const sorted = [...ranges].sort((a, b) => b.start - a.start);
      for (const range of sorted) {
        for (let i = model.nodes.length - 1; i >= 0; i--) {
          const item = model.nodes[i];
          const from = Math.max(range.start, item.start);
          const to = Math.min(range.end, item.end);
          if (from >= to || !item.node.isConnected) continue;
          const localStart = from - item.start;
          const localEnd = to - item.start;
          const value = item.node.nodeValue || '';
          const before = value.slice(0, localStart);
          const middle = value.slice(localStart, localEnd);
          const after = value.slice(localEnd);
          const frag = document.createDocumentFragment();
          if (before) frag.append(document.createTextNode(before));
          const span = document.createElement('span');
          span.className = `svoc-${range.role}`;
          span.setAttribute(ATTR, range.role);
          span.textContent = middle;
          frag.append(span);
          if (after) frag.append(document.createTextNode(after));
          const replacementNodes = [...frag.childNodes];
          item.node.replaceWith(frag);
          const textNodes = replacementNodes.filter(n => n.nodeType === Node.TEXT_NODE);
          item.node = textNodes[0] || document.createTextNode('');
          item.end = item.start + (item.node.nodeValue || '').length;
        }
      }
    }

    function queueStats(result) {
      for (const sentence of result.sentences) {
        pendingStats.processed++;
        if (sentence.ranges.length) pendingStats.highlighted++;
        if (sentence.confidence < 0.65) pendingStats.lowConfidence++;
        pendingStats.totalConfidence += sentence.confidence || 0;
        pendingStats.ruleCounts[sentence.ruleId || 'unknown'] = (pendingStats.ruleCounts[sentence.ruleId || 'unknown'] || 0) + 1;
        const host = location.hostname.toLowerCase();
        const hostEntry = pendingStats.hostCounts[host] || { processed: 0, highlighted: 0 };
        hostEntry.processed++;
        if (sentence.ranges.length) hostEntry.highlighted++;
        pendingStats.hostCounts[host] = hostEntry;
      }
      pendingStats.totalMs += result.durationMs || 0;
      if (!statsTimer) statsTimer = setTimeout(flushStats, 800);
    }

    async function flushStats() {
      statsTimer = null;
      const delta = pendingStats;
      pendingStats = { processed: 0, highlighted: 0, lowConfidence: 0, totalConfidence: 0, totalMs: 0, ruleCounts: {}, hostCounts: {} };
      if (!delta.processed) return;
      const { svocStats = {}, svocHostStats = {} } = await chrome.storage.local.get(['svocStats','svocHostStats']);
      const ruleCounts = { ...(svocStats.ruleCounts || {}) };
      for (const [rule, count] of Object.entries(delta.ruleCounts || {})) ruleCounts[rule] = (ruleCounts[rule] || 0) + count;
      const hostStats = { ...svocHostStats };
      for (const [host, count] of Object.entries(delta.hostCounts || {})) {
        const prev = hostStats[host] || { processed: 0, highlighted: 0 };
        hostStats[host] = { processed: (prev.processed || 0) + (count.processed || 0), highlighted: (prev.highlighted || 0) + (count.highlighted || 0), updatedAt: Date.now() };
      }
      await chrome.storage.local.set({
        svocHostStats: hostStats,
        svocStats: {
          processed: (svocStats.processed || 0) + delta.processed,
          highlighted: (svocStats.highlighted || 0) + delta.highlighted,
          lowConfidence: (svocStats.lowConfidence || 0) + delta.lowConfidence,
          totalConfidence: (svocStats.totalConfidence || 0) + delta.totalConfidence,
          totalMs: (svocStats.totalMs || 0) + delta.totalMs,
          ruleCounts,
          parserVersion: SVOCParser.VERSION,
          updatedAt: Date.now()
        }
      });
    }

    async function storeSamples(result, block) {
      const candidates = result.sentences
        .filter(s => s.text.length <= 360 && (s.ranges.length || ['skip.fragment', 'skip.no-main-verb'].includes(s.ruleId)))
        .sort((a, b) => a.confidence - b.confidence)
        .slice(0, 3)
        .map(s => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          sentence: s.text,
          confidence: s.confidence,
          reasons: s.reasons,
          ruleId: s.ruleId,
          ranges: s.ranges,
          host: location.hostname,
          createdAt: Date.now(),
          elementTag: block?.tagName?.toLowerCase() || null,
          elementRole: block?.getAttribute?.('role') || null
        }));
      if (!candidates.length) return;
      const { svocSamples = [] } = await chrome.storage.local.get('svocSamples');
      const dedupe = new Map();
      for (const s of [...candidates, ...svocSamples]) {
        const key = `${s.host}|${s.sentence}`;
        if (!dedupe.has(key)) dedupe.set(key, s);
      }
      await chrome.storage.local.set({ svocSamples: [...dedupe.values()].slice(0, MAX_SAMPLES) });
    }

    function highlightBlock(block) {
      if (!enabled || block.closest(SKIP_SELECTOR) || !SVOCDom.leafBlock(block) || SVOCDom.looksLikeSearchResultUi(block, location.hostname)) return;
      const model = SVOCDom.collectText(block);
      if (!englishLike(model.text)) return;
      const result = SVOCParser.analyze(model.text);
      queueStats(result);
      storeSamples(result, block).catch(() => {});
      if (result.ranges.length) applyRanges(model, result.ranges);
    }

    function scan(root = document) {
      if (!enabled) return;
      const blocks = SVOCDom.collectCandidateBlocks(root, location.hostname);
      for (const block of blocks) {
        if (observed.has(block)) continue;
        observed.add(block);
        observer.observe(block);
      }
    }

    function removeHighlights() {
      observer.disconnect();
      observed.clear();
      document.querySelectorAll(`[${ATTR}]`).forEach(span => span.replaceWith(document.createTextNode(span.textContent || '')));
      document.body?.normalize();
    }

    const mutationObserver = new MutationObserver(mutations => {
      if (!enabled) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && !node.closest?.(`[${ATTR}]`)) scan(node);
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.enabled) return;
      enabled = Boolean(changes.enabled.newValue);
      if (enabled) scan(); else removeHighlights();
    });

    chrome.runtime.onMessage.addListener(message => {
      if (message?.type !== 'SVOC_SET_ENABLED') return;
      enabled = Boolean(message.enabled);
      if (enabled) scan(); else removeHighlights();
    });

    scan();
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  bootstrap().catch(() => {});
})();

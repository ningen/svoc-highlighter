import * as SVOCPrivacy from './privacy.ts';
import { readHostStats, readSamples, readStats } from './storage.ts';
import type { DiagnosticSample, HostStats, SvocStats } from './storage.ts';

function required<T extends Element>(selector: string, type: { new(): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Missing element: ${selector}`);
  return element;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const elements = {
  summary: required('#summary', HTMLElement),
  blacklist: required('#blacklist', HTMLTextAreaElement),
  blacklistStatus: required('#blacklist-status', HTMLElement),
  hosts: required('#hosts', HTMLElement),
  samples: required('#samples', HTMLElement),
  saveBlacklist: required('#save-blacklist', HTMLButtonElement),
  export: required('#export', HTMLButtonElement),
  reset: required('#reset', HTMLButtonElement),
};

function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character] || character);
}

function marked(sample: DiagnosticSample): string {
  const ranges = [...sample.ranges].sort((a, b) => a.start - b.start);
  let output = '';
  let cursor = 0;
  for (const range of ranges) {
    output += escapeHtml(sample.sentence.slice(cursor, range.start));
    output += `<span class="${range.role}">${escapeHtml(sample.sentence.slice(range.start, range.end))}</span>`;
    cursor = range.end;
  }
  return output + escapeHtml(sample.sentence.slice(cursor));
}

function exactHostPattern(host: string): string {
  return `^${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

function cleanSample(sample: DiagnosticSample): DiagnosticSample {
  const { review: _review, ...rest } = sample;
  return rest;
}

function cleanStats(stats: unknown): SvocStats {
  return readStats(stats);
}

async function migrateLegacyReviewData(): Promise<void> {
  const stored = await chrome.storage.local.get(['svocStats', 'svocSamples']);
  const rawStats = isRecord(stored.svocStats) ? stored.svocStats : {};
  const samples = readSamples(stored.svocSamples);
  const needsStats = ['reviewedCorrect', 'reviewedWrong', 'wrongByRole'].some((key) => Object.hasOwn(rawStats, key));
  const needsSamples = samples.some((sample) => Object.hasOwn(sample, 'review'));
  if (needsStats || needsSamples) {
    await chrome.storage.local.set({
      svocStats: cleanStats(rawStats),
      svocSamples: samples.map(cleanSample),
    });
  }
}

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get([
    'svocStats',
    'svocSamples',
    'diagnosticsBlacklist',
    'svocHostStats',
  ]);
  const stats = readStats(stored.svocStats);
  const average = stats.processed ? stats.totalConfidence / stats.processed : 0;
  const milliseconds = stats.processed ? stats.totalMs / stats.processed : 0;
  elements.summary.innerHTML = `<div class=card><div class=value>${stats.processed}</div>processed</div><div class=card><div class=value>${stats.highlighted}</div>highlighted</div><div class=card><div class=value>${average ? `${Math.round(average * 100)}%` : '—'}</div>avg confidence</div><div class=card><div class=value>${milliseconds ? `${milliseconds.toFixed(2)} ms` : '—'}</div>parser / sentence</div>`;

  const patterns = SVOCPrivacy.normalizePatterns(stored.diagnosticsBlacklist);
  if (document.activeElement !== elements.blacklist) elements.blacklist.value = patterns.join('\n');
  renderHosts(readHostStats(stored.svocHostStats), patterns);

  const samples = SVOCPrivacy.filterSamples<DiagnosticSample>(readSamples(stored.svocSamples), patterns)
    .sort((a, b) => a.confidence - b.confidence || b.createdAt - a.createdAt)
    .slice(0, 100);
  if (!samples.length) {
    elements.samples.innerHTML = '<div class=empty>Browse some English pages first. Samples will appear here unless their hostname is excluded.</div>';
    return;
  }
  elements.samples.innerHTML = samples.map((sample) => {
    const skipped = !sample.ranges.length;
    return `<div class="sample" data-id="${escapeHtml(sample.id)}"><div class=sentence>${marked(sample)}</div><div class=meta>${escapeHtml(sample.host)} · ${escapeHtml(sample.elementTag)} ${skipped ? '· SKIPPED ' : ''}· confidence ${Math.round(sample.confidence * 100)}% · ${escapeHtml(sample.ruleId)} · ${sample.reasons.map(escapeHtml).join(', ')}</div></div>`;
  }).join('');
}

function renderHosts(hostStats: HostStats, patterns: string[]): void {
  const rows = Object.entries(hostStats)
    .filter(([host]) => host && !SVOCPrivacy.matchesHost(host, patterns))
    .sort((a, b) => b[1].processed - a[1].processed || a[0].localeCompare(b[0]));
  if (!rows.length) {
    elements.hosts.innerHTML = '<div class=empty>No analyzed hostnames yet.</div>';
    return;
  }
  elements.hosts.innerHTML = rows.map(([host, data]) => `<div class="host-row"><div><b>${escapeHtml(host)}</b><div class=host-meta>${data.processed.toLocaleString()} sentences · ${data.highlighted.toLocaleString()} highlighted</div></div><button class="action exclude-host" data-host="${escapeHtml(host)}">Exclude</button></div>`).join('');
}

async function persistBlacklist(patterns: string[], statusText?: string): Promise<void> {
  const stored = await chrome.storage.local.get(['svocSamples', 'svocStats', 'svocHostStats']);
  const samples = readSamples(stored.svocSamples);
  const filtered = SVOCPrivacy.filterSamples<DiagnosticSample>(samples, patterns).map(cleanSample);
  const filteredHosts = Object.fromEntries(
    Object.entries(readHostStats(stored.svocHostStats))
      .filter(([host]) => !SVOCPrivacy.matchesHost(host, patterns)),
  );
  await chrome.storage.local.set({
    diagnosticsBlacklist: patterns,
    svocSamples: filtered,
    svocStats: cleanStats(stored.svocStats),
    svocHostStats: filteredHosts,
  });
  const removed = samples.length - filtered.length;
  elements.blacklistStatus.className = 'status ok';
  elements.blacklistStatus.textContent = statusText
    || `Saved. Purged ${removed} stored sample${removed === 1 ? '' : 's'}. Reload open pages for exclusion to take effect.`;
  await load();
}

async function saveBlacklist(): Promise<void> {
  const patterns = SVOCPrivacy.normalizePatterns(elements.blacklist.value);
  const compiled = SVOCPrivacy.compile(patterns);
  const firstInvalid = compiled.invalid[0];
  if (firstInvalid) {
    elements.blacklistStatus.className = 'status err';
    elements.blacklistStatus.textContent = `Invalid regex: ${firstInvalid.source} — ${firstInvalid.message}`;
    return;
  }
  await persistBlacklist(patterns);
}

async function excludeHost(host: string): Promise<void> {
  const stored = await chrome.storage.local.get('diagnosticsBlacklist');
  const pattern = exactHostPattern(host);
  const patterns = SVOCPrivacy.normalizePatterns([
    ...SVOCPrivacy.normalizePatterns(stored.diagnosticsBlacklist),
    pattern,
  ]);
  await persistBlacklist(
    patterns,
    `${host} added to exclusions. Existing diagnostics for this host were purged. Reload pages on this host.`,
  );
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('.exclude-host');
  const host = button?.dataset.host;
  if (host) void excludeHost(host);
});

elements.saveBlacklist.addEventListener('click', () => void saveBlacklist());

elements.export.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get(['svocStats', 'svocSamples', 'diagnosticsBlacklist']);
  const safeSamples = SVOCPrivacy.filterSamples<DiagnosticSample>(
    readSamples(stored.svocSamples),
    stored.diagnosticsBlacklist,
  ).map(cleanSample);
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    svocSamples: safeSamples,
    svocStats: cleanStats(stored.svocStats),
  }, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `svoc-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
});

elements.reset.addEventListener('click', async () => {
  if (!confirm('Reset metrics, samples, and analyzed-host counts? Excluded hostname settings will be kept.')) return;
  await chrome.storage.local.remove(['svocStats', 'svocSamples', 'svocHostStats']);
  await load();
});

void (async () => {
  await migrateLegacyReviewData();
  await load();
})();

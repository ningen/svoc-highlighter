const DEFAULT_LIMIT = 200;
const CONFIDENCE_BUCKETS = [
  { label: '[0, 0.2)', min: 0, max: 0.2 },
  { label: '[0.2, 0.4)', min: 0.2, max: 0.4 },
  { label: '[0.4, 0.65)', min: 0.4, max: 0.65 },
  { label: '[0.65, 0.8)', min: 0.65, max: 0.8 },
  { label: '[0.8, 1.0]', min: 0.8, max: 1.0000001 }
];

export function decodeEntities(value) {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&');
}

export function extractPayload(dumpHtml) {
  const match = String(dumpHtml).match(/<pre\b[^>]*\bid=["']svoc-extract-result["'][^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) throw new Error('Benchmark harness result was not found in browser output');
  const payload = JSON.parse(decodeEntities(match[1]));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Benchmark harness returned an invalid payload');
  return payload;
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function rounded(value) {
  return Math.round(finiteNumber(value) * 1000) / 1000;
}

export function summarize(pages, records) {
  const safePages = Array.isArray(pages) ? pages : [];
  const safeRecords = Array.isArray(records) ? records : [];
  const successfulPages = safePages.filter(page => page.status === 'ok').length;
  const highlighted = safeRecords.filter(record => Array.isArray(record.ranges) && record.ranges.length > 0).length;
  const ruleCounts = {};
  for (const record of safeRecords) {
    const rule = typeof record.ruleId === 'string' && record.ruleId ? record.ruleId : 'unknown';
    ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
  }

  const confidenceDistribution = CONFIDENCE_BUCKETS.map(bucket => ({
    label: bucket.label,
    count: safeRecords.filter(record => {
      const confidence = finiteNumber(record.confidence);
      return confidence >= bucket.min && confidence < bucket.max;
    }).length
  }));
  const totalParseMs = safePages.reduce((sum, page) => sum + finiteNumber(page.parseMs), 0);
  const suspicious = collectSuspicious(safeRecords, 0);

  return {
    totalPages: safePages.length,
    successfulPages,
    failedPages: safePages.length - successfulPages,
    totalExtractedSentences: safeRecords.length,
    highlighted,
    skipped: safeRecords.length - highlighted,
    ruleCounts: Object.fromEntries(Object.entries(ruleCounts).sort(([a], [b]) => a.localeCompare(b))),
    confidenceDistribution,
    processingTime: {
      totalParseMs: rounded(totalParseMs),
      averageMsPerSentence: rounded(safeRecords.length ? totalParseMs / safeRecords.length : 0),
      maxBlockMs: rounded(Math.max(0, ...safePages.map(page => finiteNumber(page.maxBlockMs)))),
      totalExtractionMs: rounded(safePages.reduce((sum, page) => sum + finiteNumber(page.extractionMs), 0))
    },
    notableCounts: {
      longMultiClause: suspicious.longMultiClause.total,
      relativeAware: suspicious.relativeAware.total,
      skipNoMainVerb: suspicious.skipNoMainVerb.total,
      overlappingRanges: suspicious.overlappingRanges.total,
      mHeavy: suspicious.mHeavy.total,
      lowConfidenceHighlighted: suspicious.lowConfidenceHighlighted.total
    }
  };
}

function rangesOverlap(ranges) {
  for (let i = 0; i < ranges.length; i++) {
    const a = ranges[i];
    if (!Number.isFinite(a?.start) || !Number.isFinite(a?.end)) continue;
    for (let j = i + 1; j < ranges.length; j++) {
      const b = ranges[j];
      if (!Number.isFinite(b?.start) || !Number.isFinite(b?.end)) continue;
      if (a.start < b.end && b.start < a.end) return true;
    }
  }
  return false;
}

function suspiciousItem(record) {
  const text = typeof record.text === 'string' ? record.text : '';
  return {
    url: typeof record.url === 'string' ? record.url : '',
    host: typeof record.host === 'string' ? record.host : '',
    blockTag: typeof record.blockTag === 'string' ? record.blockTag : '',
    text: text.length > 500 ? `${text.slice(0, 497)}...` : text,
    confidence: finiteNumber(record.confidence),
    ruleId: typeof record.ruleId === 'string' ? record.ruleId : 'unknown',
    reasons: Array.isArray(record.reasons) ? record.reasons : [],
    ranges: Array.isArray(record.ranges) ? record.ranges : []
  };
}

function makeBucket(records, limit) {
  const cap = Number.isInteger(limit) && limit >= 0 ? limit : DEFAULT_LIMIT;
  return {
    total: records.length,
    capped: records.length > cap,
    items: records.slice(0, cap).map(suspiciousItem)
  };
}

export function collectSuspicious(records, limits = DEFAULT_LIMIT) {
  const safeRecords = Array.isArray(records) ? records : [];
  const limitFor = name => typeof limits === 'object' && limits !== null ? limits[name] ?? DEFAULT_LIMIT : limits;
  const longMultiClause = safeRecords.filter(record => {
    const text = typeof record.text === 'string' ? record.text : '';
    const words = text.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g) || [];
    return words.length > 24 || (text.match(/,/g) || []).length >= 2;
  });
  const overlappingRanges = safeRecords.filter(record => rangesOverlap(Array.isArray(record.ranges) ? record.ranges : []));
  const relativeAware = safeRecords.filter(record => record.ruleId === 'main.relative-aware');
  const skipNoMainVerb = safeRecords.filter(record => record.ruleId === 'skip.no-main-verb');
  const mHeavy = safeRecords.filter(record => {
    const textLength = Math.max(typeof record.text === 'string' ? record.text.length : 0, 1);
    const modifiers = (Array.isArray(record.ranges) ? record.ranges : []).filter(range => range?.role === 'm');
    const coverage = modifiers.reduce((sum, range) => sum + Math.max(0, finiteNumber(range.end) - finiteNumber(range.start)), 0);
    return modifiers.length >= 3 || coverage / textLength >= 0.4;
  });
  const lowConfidenceHighlighted = safeRecords.filter(record =>
    finiteNumber(record.confidence) < 0.65 && Array.isArray(record.ranges) && record.ranges.length > 0
  );

  return {
    longMultiClause: makeBucket(longMultiClause, limitFor('longMultiClause')),
    relativeAware: makeBucket(relativeAware, limitFor('relativeAware')),
    skipNoMainVerb: makeBucket(skipNoMainVerb, limitFor('skipNoMainVerb')),
    overlappingRanges: makeBucket(overlappingRanges, limitFor('overlappingRanges')),
    mHeavy: makeBucket(mHeavy, limitFor('mHeavy')),
    lowConfidenceHighlighted: makeBucket(lowConfidenceHighlighted, limitFor('lowConfidenceHighlighted'))
  };
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function renderSuspicious(name, bucket) {
  const lines = [`### ${name}`, '', `Total: ${bucket.total}${bucket.capped ? ' (items capped)' : ''}`, ''];
  if (!bucket.items.length) return [...lines, '_None._', ''].join('\n');
  lines.push('| Host | Rule | Confidence | Sentence |', '| --- | --- | ---: | --- |');
  for (const item of bucket.items) {
    lines.push(`| ${markdownCell(item.host)} | ${markdownCell(item.ruleId)} | ${item.confidence.toFixed(3)} | ${markdownCell(item.text)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderMarkdown(report) {
  if (!report || typeof report !== 'object' || !report.summary || !report.suspicious) throw new Error('Cannot render an invalid benchmark report');
  const { summary } = report;
  const lines = [
    '# SVOC local benchmark report',
    '',
    `Generated: ${report.generatedAt || 'unknown'}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Pages | ${summary.totalPages} |`,
    `| Successful pages | ${summary.successfulPages} |`,
    `| Failed pages | ${summary.failedPages} |`,
    `| Extracted sentences | ${summary.totalExtractedSentences} |`,
    `| Highlighted | ${summary.highlighted} |`,
    `| Skipped | ${summary.skipped} |`,
    `| Total parser time (ms) | ${summary.processingTime.totalParseMs} |`,
    `| Average ms / sentence | ${summary.processingTime.averageMsPerSentence} |`,
    `| Maximum block time (ms) | ${summary.processingTime.maxBlockMs} |`,
    `| Total extraction time (ms) | ${summary.processingTime.totalExtractionMs} |`,
    '',
    '## Confidence distribution',
    '',
    '| Bucket | Count |',
    '| --- | ---: |',
    ...summary.confidenceDistribution.map(bucket => `| ${bucket.label} | ${bucket.count} |`),
    '',
    '## Rule counts',
    '',
    '| Rule | Count |',
    '| --- | ---: |',
    ...Object.entries(summary.ruleCounts).map(([rule, count]) => `| ${markdownCell(rule)} | ${count} |`),
    '',
    '## Notable counts',
    '',
    '| Category | Count |',
    '| --- | ---: |',
    ...Object.entries(summary.notableCounts).map(([name, count]) => `| ${name} | ${count} |`),
    '',
    '## Suspicious samples',
    '',
    renderSuspicious('Long or multi-clause', report.suspicious.longMultiClause),
    renderSuspicious('Relative-aware', report.suspicious.relativeAware),
    renderSuspicious('Missing main verb', report.suspicious.skipNoMainVerb),
    renderSuspicious('Overlapping ranges', report.suspicious.overlappingRanges),
    renderSuspicious('M-heavy', report.suspicious.mHeavy),
    renderSuspicious('Low-confidence highlighted', report.suspicious.lowConfidenceHighlighted)
  ];
  return `${lines.join('\n')}\n`;
}

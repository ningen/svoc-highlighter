import * as parser from '../src/parser.ts';
import type { Role, SentenceResult } from '../src/parser.ts';
import * as privacy from '../src/privacy.ts';
import corpusJson from './corpus.json' with { type: 'json' };
import regressionJson from './diagnostics-regression.json' with { type: 'json' };
import goldJson from './gold-corpus.json' with { type: 'json' };

interface ExpectedRanges {
  readonly skip?: boolean;
  readonly s?: string;
  readonly v?: string;
  readonly o?: string;
  readonly c?: string;
  readonly m?: string;
  readonly fullAnalysis?: boolean;
}

interface ExpectedCase extends ExpectedRanges {
  readonly text: string;
  readonly multi?: ExpectedRanges[];
}

interface Failure {
  readonly text: string;
  readonly role: string;
  readonly expected: unknown;
  readonly got: unknown;
  readonly confidence?: number;
  readonly rule?: string;
}

const corpus: ExpectedCase[] = corpusJson;
const regression: ExpectedCase[] = regressionJson;
const gold: ExpectedCase[] = goldJson;
const roles: Role[] = ['s', 'v', 'o', 'c', 'm'];
let checks = 0;
let pass = 0;
const failures: Failure[] = [];

function checkOne(expected: ExpectedRanges, result: SentenceResult, text: string): void {
  const got: Partial<Record<Role, string>> = {};
  for (const range of result.ranges) got[range.role] = text.slice(range.start, range.end);
  if (expected.skip) {
    checks++;
    if (!result.ranges.length) pass++;
    else failures.push({ text, role: 'skip', expected: 'no ranges', got: JSON.stringify(got), rule: result.ruleId });
    return;
  }
  for (const role of roles) {
    if (expected[role] === undefined) continue;
    checks++;
    if (got[role] === expected[role]) pass++;
    else failures.push({
      text,
      role,
      expected: expected[role],
      got: got[role] || null,
      confidence: result.confidence,
      rule: result.ruleId,
    });
  }
}

function firstSentence(text: string): SentenceResult {
  const sentence = parser.analyze(text).sentences[0];
  if (!sentence) throw new Error(`Parser returned no sentence for: ${text}`);
  return sentence;
}

for (const item of corpus) {
  const result = item.m !== undefined ? firstSentence(item.text) : parser.analyzeSentence(item.text, 0);
  checkOne(item, result, item.text);
}
for (const item of gold) {
  const result = item.m !== undefined || item.fullAnalysis === true
    ? firstSentence(item.text)
    : parser.analyzeSentence(item.text, 0);
  checkOne(item, result, item.text);
}
for (const item of regression) {
  if (item.multi) {
    const sentences = parser.analyze(item.text).sentences;
    checks++;
    if (sentences.length === item.multi.length) pass++;
    else failures.push({ text: item.text, role: 'clause-count', expected: item.multi.length, got: sentences.length });
    for (let index = 0; index < Math.min(sentences.length, item.multi.length); index++) {
      const sentence = sentences[index];
      const expected = item.multi[index];
      if (sentence && expected) checkOne(expected, sentence, sentence.text);
    }
  } else {
    checkOne(item, parser.analyzeSentence(item.text, 0), item.text);
  }
}

function privacyCheck(name: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual === expected) pass++;
  else failures.push({ text: name, role: 'privacy', expected, got: actual, rule: 'privacy' });
}

privacyCheck('exact internal host', privacy.matchesHost('internal.example.com', ['^internal\\.example\\.com$']), true);
privacyCheck('subdomain family', privacy.matchesHost('api.corp.example.com', ['(^|\\.)corp\\.example\\.com$']), true);
privacyCheck('unrelated public host', privacy.matchesHost('example.com', ['(^|\\.)corp\\.example\\.com$']), false);
privacyCheck('case insensitive', privacy.matchesHost('SECRET.Example.COM', ['^secret\\.example\\.com$']), true);
privacyCheck('invalid regex detected', privacy.compile(['[broken']).invalid.length, 1);
const filtered = privacy.filterSamples<{ host: string }>(
  [{ host: 'secret.example.com' }, { host: 'docs.example.com' }],
  ['^secret\\.example\\.com$'],
);
privacyCheck('blacklisted samples purged', filtered.length, 1);
privacyCheck('safe sample retained', filtered[0]?.host, 'docs.example.com');
privacyCheck('exact-host regex escapes dots', privacy.matchesHost('docs.example.com', ['^docs\\.example\\.com$']), true);
privacyCheck('exact-host regex does not match subdomain', privacy.matchesHost('api.docs.example.com', ['^docs\\.example\\.com$']), false);

console.log(`SVOC corpus + human-reviewed gold corpus + diagnostics regression + privacy: ${pass}/${checks} checks passed (${(pass / checks * 100).toFixed(1)}%)`);
for (const failure of failures) {
  console.log(`FAIL ${failure.role.toUpperCase()} | ${failure.text}\n  expected: ${String(failure.expected)}\n  got:      ${String(failure.got)}\n  rule:     ${failure.rule || ''}\n`);
}
process.exitCode = failures.length ? 1 : 0;

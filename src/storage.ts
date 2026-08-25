import type { ParserRange } from './parser.ts';

export interface HostCount {
  processed: number;
  highlighted: number;
  updatedAt?: number;
}

export interface SvocStats {
  processed: number;
  highlighted: number;
  lowConfidence: number;
  totalConfidence: number;
  totalMs: number;
  ruleCounts: Record<string, number>;
  parserVersion?: string;
  updatedAt?: number;
}

export interface DiagnosticSample {
  readonly id: string;
  readonly sentence: string;
  readonly confidence: number;
  readonly reasons: string[];
  readonly ruleId: string;
  readonly ranges: ParserRange[];
  readonly host: string;
  readonly createdAt: number;
  readonly elementTag: string | null;
  readonly elementRole: string | null;
  readonly review?: unknown;
}

export type HostStats = Record<string, HostCount>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isParserRange(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (value.role === 's' || value.role === 'v' || value.role === 'o' || value.role === 'c' || value.role === 'm')
    && typeof value.start === 'number'
    && Number.isFinite(value.start)
    && typeof value.end === 'number'
    && Number.isFinite(value.end)
    && value.start >= 0
    && value.end >= value.start;
}

export function readStats(value: unknown): SvocStats {
  const record = isRecord(value) ? value : {};
  const rawRules = isRecord(record.ruleCounts) ? record.ruleCounts : {};
  const ruleCounts = Object.fromEntries(
    Object.entries(rawRules).map(([key, count]) => [key, finiteNumber(count)]),
  );
  return {
    processed: finiteNumber(record.processed),
    highlighted: finiteNumber(record.highlighted),
    lowConfidence: finiteNumber(record.lowConfidence),
    totalConfidence: finiteNumber(record.totalConfidence),
    totalMs: finiteNumber(record.totalMs),
    ruleCounts,
    ...(typeof record.parserVersion === 'string' ? { parserVersion: record.parserVersion } : {}),
    ...(typeof record.updatedAt === 'number' ? { updatedAt: record.updatedAt } : {}),
  };
}

export function readHostStats(value: unknown): HostStats {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([host, raw]) => {
      if (!isRecord(raw)) return [];
      return [[host, {
        processed: finiteNumber(raw.processed),
        highlighted: finiteNumber(raw.highlighted),
        ...(typeof raw.updatedAt === 'number' ? { updatedAt: raw.updatedAt } : {}),
      }]];
    }),
  );
}

export function readSamples(value: unknown): DiagnosticSample[] {
  if (!Array.isArray(value)) return [];
  return value.filter((sample): sample is DiagnosticSample => {
    if (!isRecord(sample)) return false;
    const sentenceLength = typeof sample.sentence === 'string' ? sample.sentence.length : -1;
    return typeof sample.id === 'string'
      && typeof sample.sentence === 'string'
      && typeof sample.confidence === 'number'
      && typeof sample.ruleId === 'string'
      && typeof sample.host === 'string'
      && typeof sample.createdAt === 'number'
      && Array.isArray(sample.reasons)
      && sample.reasons.every((reason) => typeof reason === 'string')
      && Array.isArray(sample.ranges)
      && sample.ranges.every(isParserRange)
      && sample.ranges.every((range) => isParserRange(range) && range.end <= sentenceLength);
  });
}

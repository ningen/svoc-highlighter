export interface CompiledPattern {
  readonly source: string;
  readonly regex: RegExp;
}

export interface PatternCompilation {
  readonly valid: CompiledPattern[];
  readonly invalid: Array<{ readonly source: string; readonly message: string }>;
}

export const VERSION = '0.6.0';
export const STORAGE_KEY = 'diagnosticsBlacklist';

export function normalizePatterns(value: unknown): string[] {
  const list = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return [...new Set(list.map((item) => String(item).trim()).filter((item) => item && !item.startsWith('#')))];
}

export function compile(patterns: unknown): PatternCompilation {
  const valid: CompiledPattern[] = [];
  const invalid: PatternCompilation['invalid'] = [];
  for (const source of normalizePatterns(patterns)) {
    try {
      valid.push({ source, regex: new RegExp(source, 'i') });
    } catch (error: unknown) {
      invalid.push({ source, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { valid, invalid };
}

function isCompiledPattern(value: unknown): value is CompiledPattern {
  return typeof value === 'object' && value !== null && 'regex' in value && value.regex instanceof RegExp;
}

export function matchesHost(host: unknown, compiledOrPatterns: unknown): boolean {
  const hostname = String(host || '').trim().toLowerCase();
  if (!hostname) return false;
  const compiled = Array.isArray(compiledOrPatterns) && compiledOrPatterns.every(isCompiledPattern)
    ? compiledOrPatterns
    : compile(compiledOrPatterns).valid;
  return compiled.some(({ regex }) => regex.test(hostname));
}

export function filterSamples<T extends { readonly host?: unknown }>(samples: unknown, patterns: unknown): T[] {
  if (!Array.isArray(samples)) return [];
  return (samples as T[]).filter((sample) => !matchesHost(sample?.host, patterns));
}

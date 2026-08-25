(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SVOCPrivacy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.6.0';
  const STORAGE_KEY = 'diagnosticsBlacklist';

  function normalizePatterns(value) {
    const list = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    return [...new Set(list.map(v => String(v).trim()).filter(v => v && !v.startsWith('#')))];
  }

  function compile(patterns) {
    const valid = [];
    const invalid = [];
    for (const source of normalizePatterns(patterns)) {
      try { valid.push({ source, regex: new RegExp(source, 'i') }); }
      catch (error) { invalid.push({ source, message: error?.message || String(error) }); }
    }
    return { valid, invalid };
  }

  function matchesHost(host, compiledOrPatterns) {
    const hostname = String(host || '').trim().toLowerCase();
    if (!hostname) return false;
    const compiled = Array.isArray(compiledOrPatterns) && compiledOrPatterns.length && compiledOrPatterns[0]?.regex
      ? { valid: compiledOrPatterns }
      : compile(compiledOrPatterns || []);
    return compiled.valid.some(item => item.regex.test(hostname));
  }

  function filterSamples(samples, patterns) {
    return (Array.isArray(samples) ? samples : []).filter(sample => !matchesHost(sample?.host, patterns));
  }



  return { VERSION, STORAGE_KEY, normalizePatterns, compile, matchesHost, filterSamples };
});

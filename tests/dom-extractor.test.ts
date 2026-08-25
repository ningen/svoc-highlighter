// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { collectCandidateBlocks, collectText } from '../src/dom-extractor.ts';

describe('DOM extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="fixture">
        <p id="inline">Set <code>minimumReleaseAge</code> to <code>3 days</code> for stable dependencies.</p>
        <nav><p id="nav">Navigation should not be parsed.</p></nav>
        <pre id="pre">const x = 1;</pre>
        <p id="body">This option supports template syntax.</p>
        <ul><li id="result">GitHubDocs A long search result snippet that should not be parsed as one grammatical sentence.</li></ul>
      </div>
    `;
  });

  it('preserves text split across inline elements', () => {
    const inline = document.querySelector('#inline');
    expect(inline).toBeInstanceOf(Element);
    expect(collectText(inline as Element).text).toBe(
      'Set minimumReleaseAge to 3 days for stable dependencies.',
    );
  });

  it('excludes navigation and preformatted content', () => {
    const ids = collectCandidateBlocks(document, 'docs.example.com').map(({ id }) => id);
    expect(ids).toContain('body');
    expect(ids).not.toContain('nav');
    expect(ids).not.toContain('pre');
  });

  it('excludes Google search-result list items', () => {
    const ids = collectCandidateBlocks(document, 'www.google.com').map(({ id }) => id);
    expect(ids).not.toContain('result');
  });
});

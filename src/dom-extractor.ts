export interface TextNodeRange {
  node: Text;
  readonly start: number;
  end: number;
}

export interface CollectedText {
  readonly text: string;
  readonly nodes: TextNodeRange[];
}

export const ATTR = 'data-svoc-highlight';
export const BLOCK_SELECTOR = 'p, li, td, th, blockquote, dd, dt, figcaption';
export const SKIP_SELECTOR = "pre, script, style, textarea, input, select, option, kbd, samp, var, nav, header, footer, button, [role='navigation'], [role='presentation'], [contenteditable='true']";

export function leafBlock(block: Element): boolean {
  return !block.querySelector(BLOCK_SELECTOR);
}

export function looksLikeSearchResultUi(block: Element | null, hostname = ''): boolean {
  const host = String(hostname || '').toLowerCase();
  return (host === 'www.google.com' || host.endsWith('.google.com')) && block?.tagName === 'LI';
}

export function collectText(block: Element | null, documentRef = block?.ownerDocument): CollectedText {
  const nodes: TextNodeRange[] = [];
  let text = '';
  if (!block || !documentRef) return { text, nodes };
  const NodeFilterRef = documentRef.defaultView?.NodeFilter ?? NodeFilter;
  const walker = documentRef.createTreeWalker(block, NodeFilterRef.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_SELECTOR) || parent.closest(`[${ATTR}]`)) return NodeFilterRef.FILTER_REJECT;
      if (!node.nodeValue?.trim()) return NodeFilterRef.FILTER_REJECT;
      return NodeFilterRef.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const start = text.length;
    text += node.nodeValue || '';
    nodes.push({ node, start, end: text.length });
  }
  return { text, nodes };
}

export function collectCandidateBlocks(root: Document | Element, hostname = ''): Element[] {
  const out: Element[] = [];
  const ElementRef = root.ownerDocument?.defaultView?.Element ?? (root as Document).defaultView?.Element ?? Element;
  if (root instanceof ElementRef && root.matches(BLOCK_SELECTOR)) out.push(root);
  root.querySelectorAll(BLOCK_SELECTOR).forEach((element) => out.push(element));
  return out.filter((block) => !block.closest(SKIP_SELECTOR) && leafBlock(block) && !looksLikeSearchResultUi(block, hostname));
}

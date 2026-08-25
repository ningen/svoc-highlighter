(function(root, factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.SVOCDom=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ATTR='data-svoc-highlight';
  const BLOCK_SELECTOR='p, li, td, th, blockquote, dd, dt, figcaption';
  const SKIP_SELECTOR="pre, script, style, textarea, input, select, option, kbd, samp, var, nav, header, footer, button, [role='navigation'], [role='presentation'], [contenteditable='true']";

  function leafBlock(block){ return !block.querySelector(BLOCK_SELECTOR); }

  function looksLikeSearchResultUi(block, hostname=''){
    const host=String(hostname||'').toLowerCase();
    return (host==='www.google.com'||host.endsWith('.google.com')) && block?.tagName==='LI';
  }

  function collectText(block, documentRef=block?.ownerDocument){
    const nodes=[]; let text='';
    if(!block||!documentRef) return {text,nodes};
    const NodeFilterRef=documentRef.defaultView?.NodeFilter || globalThis.NodeFilter;
    const walker=documentRef.createTreeWalker(block, NodeFilterRef.SHOW_TEXT, {
      acceptNode(node){
        const parent=node.parentElement;
        if(!parent||parent.closest(SKIP_SELECTOR)||parent.closest(`[${ATTR}]`)) return NodeFilterRef.FILTER_REJECT;
        if(!node.nodeValue||!node.nodeValue.trim()) return NodeFilterRef.FILTER_REJECT;
        return NodeFilterRef.FILTER_ACCEPT;
      }
    });
    while(walker.nextNode()){
      const node=walker.currentNode, start=text.length;
      text+=node.nodeValue;
      nodes.push({node,start,end:text.length});
    }
    return {text,nodes};
  }

  function collectCandidateBlocks(root, hostname=''){
    const out=[];
    const ElementRef=root?.ownerDocument?.defaultView?.Element || root?.defaultView?.Element || globalThis.Element;
    if(ElementRef && root instanceof ElementRef && root.matches(BLOCK_SELECTOR)) out.push(root);
    root?.querySelectorAll?.(BLOCK_SELECTOR).forEach(el=>out.push(el));
    return out.filter(block=>!block.closest(SKIP_SELECTOR)&&leafBlock(block)&&!looksLikeSearchResultUi(block,hostname));
  }

  return {ATTR,BLOCK_SELECTOR,SKIP_SELECTOR,leafBlock,looksLikeSearchResultUi,collectText,collectCandidateBlocks};
});

// File: core/content/highlights/anchor.js
// Purpose: Build a DOM + quote anchor for a text selection.
// Important: We MUST NOT anchor inside our own highlight marks, otherwise we can create duplicates
// and unstable XPaths like ".../mark[1]/text()[1]".

import { UI_ATTR, HIGHLIGHT_CLASS } from "./constants.js";

// Check if a node is a text node.
function isText(n) {
  return n && n.nodeType === Node.TEXT_NODE;
}

// Treat empty or whitespace-only text nodes as ignorable.
function isIgnorableTextNode(node) {
  const v = node?.nodeValue ?? "";
  return v.trim().length === 0;
}

// Collect text nodes intersecting the selection range.
function collectTextNodesInRange(range) {
  const ancestor = range.commonAncestorContainer;
  const root =
    ancestor.nodeType === 1 ? ancestor : ancestor.parentElement || document.body;

  const out = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || isIgnorableTextNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Ignore non-content contexts
        if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;

        // Ignore any of our injected UI
        if (parent.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;

        // ✅ Critical: never anchor inside existing highlights (prevents duplicates)
        if (parent.closest(`mark.${HIGHLIGHT_CLASS}[data-hid]`)) return NodeFilter.FILTER_REJECT;

        try {
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        } catch {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
    false
  );

  let n = walker.nextNode();
  while (n) {
    out.push(n);
    n = walker.nextNode();
  }
  return out;
}

// Build an XPath that targets a text node: .../text()[k].
function getXPathForTextNode(textNode) {
  const parent = textNode.parentNode;
  if (!parent || parent.nodeType !== 1) return "";

  const parentPath = getXPathForElement(parent);

  let i = 1;
  let sib = textNode.previousSibling;
  while (sib) {
    if (sib.nodeType === Node.TEXT_NODE) i++;
    sib = sib.previousSibling;
  }

  return `${parentPath}/text()[${i}]`;
}

// Build an XPath to a specific element using sibling indexes.
function getXPathForElement(el) {
  if (el === document.documentElement) return "/html";

  const segments = [];
  let node = el;

  while (node && node.nodeType === 1 && node !== document) {
    const tag = node.tagName.toLowerCase();

    let index = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.tagName.toLowerCase() === tag) index++;
      sib = sib.previousElementSibling;
    }

    segments.unshift(`${tag}[${index}]`);
    node = node.parentElement;

    if (node === document.documentElement) {
      segments.unshift("html[1]");
      break;
    }
  }

  return "/" + segments.join("/");
}

// Clamp an offset to the valid length of a text node.
function clampOffset(textNode, offset) {
  const len = textNode?.nodeValue?.length ?? 0;
  const n = typeof offset === "number" ? offset : 0;
  return Math.max(0, Math.min(len, n));
}

// Get the last N characters of a string.
function takeSuffix(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(s.length - n);
}

// Get the first N characters of a string.
function takePrefix(s, n) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n);
}

// Produce an anchor object describing the selection.
export function makeAnchor(range) {
  const exact = range.toString();
  if (!exact || exact.trim().length === 0) return null;

  const nodes = collectTextNodesInRange(range);
  if (nodes.length === 0) return null;

  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  const startOffset =
    isText(range.startContainer) && range.startContainer === first
      ? clampOffset(first, range.startOffset)
      : 0;

  const endOffset =
    isText(range.endContainer) && range.endContainer === last
      ? clampOffset(last, range.endOffset)
      : (last.nodeValue?.length ?? 0);

  const dom = {
    start: { xpath: getXPathForTextNode(first), offset: startOffset },
    end: { xpath: getXPathForTextNode(last), offset: endOffset },
  };

  // Capture short prefix/suffix context from the edge nodes.
  const before = (first.nodeValue || "").slice(0, startOffset);
  const after = (last.nodeValue || "").slice(endOffset);

  const quote = {
    exact,
    prefix: takeSuffix(before, 32),
    suffix: takePrefix(after, 32),
  };

  return { dom, quote };
}

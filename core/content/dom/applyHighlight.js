import {
  HIGHLIGHT_CLASS,
  HIGHLIGHT_STYLE_ID,
  UI_ATTR,
} from "../highlights/constants.js";

// Ensure the highlight styles exist once per page.
function ensureHighlightStyle() {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    mark.${HIGHLIGHT_CLASS}{
      background: rgba(253, 224, 71, 0.55);
      box-shadow: inset 0 -1px 0 rgba(234, 179, 8, 0.90);
      border-radius: 3px;
      padding: 0 1px;
      color: inherit;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Collect text nodes within the selection range, excluding UI and existing highlights.
function collectTextNodesInRange(range) {
  const root =
    range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (!root) return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const value = node.nodeValue || "";
      if (value.trim().length === 0) return NodeFilter.FILTER_REJECT;

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;

      // ❗️Do not nest highlights inside highlights
      if (parent.closest(`mark.${HIGHLIGHT_CLASS}`)) return NodeFilter.FILTER_REJECT;

      try {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      } catch {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  let n = walker.nextNode();
  while (n) {
    nodes.push(n);
    n = walker.nextNode();
  }
  return nodes;
}

function clampOffset(textNode, offset) {
  const len = textNode?.nodeValue?.length ?? 0;
  const n = typeof offset === "number" ? offset : 0;
  return Math.max(0, Math.min(len, n));
}

// Split a text node and wrap the target slice in a mark element.
function wrapTextSlice(textNode, startOffset, endOffset, highlightId) {
  let node = textNode;

  if (endOffset < node.nodeValue.length) {
    node.splitText(endOffset);
  }

  if (startOffset > 0) {
    node = node.splitText(startOffset);
  }

  const mark = document.createElement("mark");
  mark.className = HIGHLIGHT_CLASS;
  mark.setAttribute("data-hid", highlightId);

  // IMPORTANT: do NOT mark highlight as UI_ATTR (it is not UI)
  node.parentNode.insertBefore(mark, node);
  mark.appendChild(node);
}

// Apply highlight markup to every text node touched by the range.
export function applyHighlight(range, highlightId) {
  ensureHighlightStyle();

  const textNodes = collectTextNodesInRange(range);
  if (textNodes.length === 0) return { ok: false, error: "No text nodes" };

  const id =
    highlightId ||
    (globalThis.crypto?.randomUUID && crypto.randomUUID()) ||
    `h_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  for (const tn of textNodes) {
    const fullLen = tn.nodeValue?.length ?? 0;
    if (fullLen === 0) continue;

    const isStart = tn === range.startContainer;
    const isEnd = tn === range.endContainer;

    const start = clampOffset(tn, isStart ? range.startOffset : 0);
    const end = clampOffset(tn, isEnd ? range.endOffset : fullLen);

    if (end <= start) continue;

    const slice = tn.nodeValue.slice(start, end);
    if (slice.trim().length === 0) continue;

    wrapTextSlice(tn, start, end, id);
  }

  return { ok: true, id };
}

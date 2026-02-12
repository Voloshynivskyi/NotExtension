// File: core/content/dom/applyHighlight.js
// Purpose: Apply a highlight mark to the DOM for a given selection range.
const HIGHLIGHT_CLASS = "notext-highlight";
const STYLE_ID = "notext-highlight-style";
const UI_ATTR = "data-notextension-ui";

// Ensure the highlight styles exist once per page.
function ensureHighlightStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${HIGHLIGHT_CLASS}{
      background: rgba(253, 224, 71, 0.55); /* yellow */
      box-shadow: inset 0 -1px 0 rgba(234, 179, 8, 0.90);
      border-radius: 3px;
      padding: 0 1px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Collect text nodes within the selection, excluding UI and ignored tags.
function collectTextNodesInRange(range) {
  const root =
    range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  if (!root) return [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip script/style/noscript and extension UI nodes.
        if (parent.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
        if (parent.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;

        // Only accept nodes that truly intersect the range.
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

  const nodes = [];
  let n = walker.nextNode();
  while (n) {
    nodes.push(n);
    n = walker.nextNode();
  }
  return nodes;
}

// Split a text node and wrap the target slice in a mark element.
function wrapTextSlice(textNode, startOffset, endOffset, highlightId) {
  let node = textNode;

  // Step 1: split the end boundary first.
  if (endOffset < node.nodeValue.length) {
    node.splitText(endOffset);
  }

  // Step 2: split the start boundary to isolate the slice.
  if (startOffset > 0) {
    node = node.splitText(startOffset);
  }

  // Step 3: wrap the exact slice with a mark tag.
  const mark = document.createElement("mark");
  mark.className = HIGHLIGHT_CLASS;
  mark.setAttribute("data-hid", highlightId);

  // Tag as UI to avoid catching selections inside the mark later.
  mark.setAttribute(UI_ATTR, "1");

  node.parentNode.insertBefore(mark, node);
  mark.appendChild(node);
}

// Apply highlight markup to every text node touched by the range.
export function applyHighlight(range) {
  ensureHighlightStyle();

  const textNodes = collectTextNodesInRange(range);
  if (textNodes.length === 0) return { ok: false, error: "No text nodes" };

  const id =
    (globalThis.crypto?.randomUUID && crypto.randomUUID()) ||
    `h_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  for (const tn of textNodes) {
    let start = 0;
    let end = tn.nodeValue.length;

    if (tn === range.startContainer) start = range.startOffset;
    if (tn === range.endContainer) end = range.endOffset;

    start = Math.max(0, Math.min(tn.nodeValue.length, start));
    end = Math.max(0, Math.min(tn.nodeValue.length, end));
    if (end <= start) continue;

    wrapTextSlice(tn, start, end, id);
  }

  return { ok: true, id };
}

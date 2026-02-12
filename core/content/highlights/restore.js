// File: core/content/highlights/restore.js
// Purpose: Restore a DOM Range from a stored highlight anchor.
const UI_ATTR = "data-notextension-ui";

// Check if a node is a text node.
function isText(n) {
  return n && n.nodeType === Node.TEXT_NODE;
}

// Clamp an offset to a valid text node boundary.
function clampOffset(textNode, offset) {
  const len = textNode?.nodeValue?.length ?? 0;
  const n = typeof offset === "number" ? offset : 0;
  return Math.max(0, Math.min(len, n));
}

// Evaluate an XPath expression and return the first node.
function evalXPath(xpath) {
  if (!xpath || typeof xpath !== "string") return null;
  try {
    const res = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return res.singleNodeValue || null;
  } catch {
    return null;
  }
}

// Detect whether a node belongs to the extension UI.
function isInsideOurUI(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(el?.closest?.(`[${UI_ATTR}]`));
}

// Restore a range from DOM XPath anchors.
function restoreByDom(dom) {
  const sNode = evalXPath(dom?.start?.xpath);
  const eNode = evalXPath(dom?.end?.xpath);
  if (!isText(sNode) || !isText(eNode)) return null;

  if (isInsideOurUI(sNode) || isInsideOurUI(eNode)) return null;

  const sOff = clampOffset(sNode, dom.start.offset);
  const eOff = clampOffset(eNode, dom.end.offset);

  const r = document.createRange();
  try {
    r.setStart(sNode, sOff);
    r.setEnd(eNode, eOff);
  } catch {
    return null;
  }

  if (r.collapsed) return null;
  return r;
}

// ---------- Quote search ----------
// Build a linear text index over visible text nodes.
function buildTextIndex() {
  const root = document.body || document.documentElement;
  if (!root) return null;

  const nodes = [];
  const starts = [];
  let full = "";
  let pos = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const v = node.nodeValue || "";
      if (v.trim().length === 0) return NodeFilter.FILTER_REJECT;

      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;

      if (p.closest("script, style, noscript")) return NodeFilter.FILTER_REJECT;
      if (p.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let n = walker.nextNode();
  while (n) {
    const v = n.nodeValue || "";
    nodes.push(n);
    starts.push(pos);
    full += v;
    pos += v.length;
    n = walker.nextNode();
  }

  return { nodes, starts, full };
}

// Convert a global character offset into a node + offset pair.
function posToNodeOffset(index, idx) {
  // Binary search over node start positions.
  const starts = idx.starts;
  const nodes = idx.nodes;

  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = starts[mid];
    const nextS = mid + 1 < starts.length ? starts[mid + 1] : Infinity;

    if (index >= s && index < nextS) {
      const node = nodes[mid];
      const off = index - s;
      return { node, offset: clampOffset(node, off) };
    }

    if (index < s) hi = mid - 1;
    else lo = mid + 1;
  }

  return null;
}

// Escape a string for RegExp use.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize whitespace runs for context matching.
function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Find the best quote match using exact or context-aware search.
function findBestQuoteMatch(fullText, quote) {
  const exact = quote?.exact;
  if (!exact || typeof exact !== "string" || exact.trim().length === 0) return null;

  // 1) Fast path: direct substring match.
  const directIdx = fullText.indexOf(exact);
  if (directIdx !== -1) return { index: directIdx, length: exact.length };

  // 2) Token-based regex that tolerates whitespace differences.
  const tokens = exact.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const pattern = tokens.map(escapeRegExp).join("[\\s\\u00A0]*");
  const re = new RegExp(pattern, "g");

  const prefix = normalizeWs(quote?.prefix || "");
  const suffix = normalizeWs(quote?.suffix || "");

  let best = null;
  let m;

  while ((m = re.exec(fullText))) {
    const idx = m.index;
    const len = m[0].length;

    // Score by prefix/suffix context when available.
    let score = 0;

    if (prefix) {
      const left = fullText.slice(Math.max(0, idx - 200), idx);
      if (normalizeWs(left).endsWith(prefix)) score += 2;
    }

    if (suffix) {
      const right = fullText.slice(idx + len, idx + len + 200);
      if (normalizeWs(right).startsWith(suffix)) score += 2;
    }

    // Context-free matches are allowed but score lower.
    if (!best || score > best.score) {
      best = { index: idx, length: len, score };
      if (score >= 4) break; // Ideal match.
    }
  }

  return best ? { index: best.index, length: best.length } : null;
}

// Restore a range using quote search over the text index.
function restoreByQuote(quote) {
  const idx = buildTextIndex();
  if (!idx) return null;

  const match = findBestQuoteMatch(idx.full, quote);
  if (!match) return null;

  const startPos = match.index;
  const endPos = match.index + match.length;

  const a = posToNodeOffset(startPos, idx);
  const b = posToNodeOffset(endPos, idx);
  if (!a || !b) return null;

  if (isInsideOurUI(a.node) || isInsideOurUI(b.node)) return null;

  const r = document.createRange();
  try {
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
  } catch {
    return null;
  }

  if (r.collapsed) return null;
  return r;
}

// ---- PUBLIC ----
// Restore a range using DOM anchors with a quote fallback.
export function restoreRange(anchor) {
  if (!anchor || typeof anchor !== "object") return null;

  // 1) DOM anchor.
  const byDom = restoreByDom(anchor.dom);
  if (byDom) {
    const exact = anchor?.quote?.exact;
    if (typeof exact === "string" && exact.trim().length > 0) {
      const got = byDom.toString();
      if (got.trim().length > 0) {
        // Accept if there is any reasonable similarity.
        if (got.includes(exact) || exact.includes(got)) return byDom;
      }
    } else {
      return byDom;
    }
    // If DOM yields a mismatched result, fall back to quote.
  }

  // 2) Quote fallback.
  return restoreByQuote(anchor.quote);
}

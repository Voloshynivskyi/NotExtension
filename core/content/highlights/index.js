// core/content/highlights/index.js
import { makeAnchor } from "./anchor.js";
import { getPageUrl, createHighlight, listHighlights } from "./api.js";
import { restoreRange } from "./restore.js";

const UI_ATTR = "data-notextension-ui";
const TOOLBAR_ID = "notext-hl-toolbar";
const STYLE_ID = "notext-hl-style";
const HIGHLIGHT_CLASS = "notext-highlight";

const Z_INDEX = 2147483647;

// ---- INTERNAL STATE ----
let lastRange = null;
let lastPointer = null; // { x, y, ts }

// ---- PUBLIC INIT ----
export function initHighlights() {
  ensureStyle();

  // ✅ Відновлення хайлайтів на старті (з retry)
  scheduleRestoreWithRetries();

  const toolbar = ensureToolbar(async () => {
    if (!lastRange) return;

    const r = lastRange.cloneRange();

    // 1) anchor (dom + quote)
    const anchor = makeAnchor(r);
    const exact = anchor?.quote?.exact || "";
    if (exact.trim().length === 0) return;

    const pageUrl = getPageUrl();

    // 2) створюємо highlight у background -> отримуємо id
    const created = await createHighlight({
      pageUrl,
      color: "yellow",
      anchor,
    });

    if (!created?.ok || !created?.highlight?.id) {
      console.warn("[highlights] create failed:", created?.error);
      return;
    }

    const highlightId = created.highlight.id;

    // 3) малюємо в DOM тим самим id
    applyHighlight(r, highlightId);

    hideToolbar();

    const sel = window.getSelection?.();
    sel?.removeAllRanges();
  });

  function hideToolbar() {
    toolbar.style.display = "none";
  }

  let raf = null;

  document.addEventListener(
    "selectionchange",
    () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;

        const range = getValidSelectionRange();
        if (!range) {
          lastRange = null;
          hideToolbar();
          return;
        }

        lastRange = range.cloneRange();
      });
    },
    true,
  );

  document.addEventListener(
    "mouseup",
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY, ts: Date.now() };

      const range = getValidSelectionRange();
      if (!range) {
        hideToolbar();
        return;
      }

      lastRange = range.cloneRange();
      showToolbarSmart(lastRange, lastPointer);
    },
    true,
  );

  document.addEventListener(
    "keyup",
    (e) => {
      if (
        !["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          e.key,
        )
      )
        return;

      const range = getValidSelectionRange();
      if (!range) {
        hideToolbar();
        return;
      }

      lastRange = range.cloneRange();
      showToolbarSmart(lastRange, null);
    },
    true,
  );

  document.addEventListener(
    "mousedown",
    (e) => {
      const target = e.target;
      if (isInsideToolbar(target)) return;
      hideToolbar();
    },
    true,
  );

  hideToolbar();
}

// ---- RESTORE (init) ----
function hasHighlightAlready(id) {
  if (!id) return false;
  return Boolean(document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`));
}

function compareRanges(a, b) {
  const ar = a.range;
  const br = b.range;

  if (ar.startContainer === br.startContainer) {
    return ar.startOffset - br.startOffset;
  }

  const pos = ar.startContainer.compareDocumentPosition(br.startContainer);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

async function restoreAllOnce() {
  const pageUrl = getPageUrl();
  const res = await listHighlights({ pageUrl });

  console.log("[hl] restore pageUrl", pageUrl, res);

  if (!res?.ok) return { total: 0, restored: 0 };

  const list = Array.isArray(res.highlights) ? res.highlights : [];
  if (list.length === 0) return { total: 0, restored: 0 };

  // 1) СПОЧАТКУ рахуємо ranges (на “чистому” DOM)
  const planned = [];
  for (const h of list) {
    const id = h?.id;
    if (!id || hasHighlightAlready(id)) continue;

    const r = restoreRange(h?.anchor);
    if (r) planned.push({ id, range: r.cloneRange() });
  }

  if (planned.length === 0) return { total: list.length, restored: 0 };

  // 2) Сортуємо по позиції і застосовуємо З КІНЦЯ (менше шансів поламати інші)
  planned.sort(compareRanges);

  let restored = 0;
  for (let i = planned.length - 1; i >= 0; i--) {
    const item = planned[i];
    if (hasHighlightAlready(item.id)) continue;
    applyHighlight(item.range, item.id);
    restored++;
  }

  return { total: list.length, restored };
}

function scheduleRestoreWithRetries() {
  // Декілька спроб: одразу, потім трохи пізніше (DOM може домальовуватись)
  const delays = [0, 250, 1000, 2500, 5000];

  delays.forEach((ms) => {
    setTimeout(async () => {
      try {
        const { total, restored } = await restoreAllOnce();
        if (total > 0) {
          console.log(`[hl] restore pass: restored ${restored}/${total}`);
        }
      } catch (e) {
        console.warn("[hl] restore failed:", e);
      }
    }, ms);
  });

  // Плюс “на load” (деякі сайти підвантажують пізніше)
  window.addEventListener(
    "load",
    () => {
      setTimeout(() => restoreAllOnce().catch(() => { }), 0);
    },
    { once: true },
  );
}

// ---- UI: toolbar + style ----
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TOOLBAR_ID} {
      position: fixed;
      z-index: ${Z_INDEX};
      display: none;
      padding: 6px;
      border-radius: 10px;
      background: rgba(17, 24, 39, 0.96);
      box-shadow: 0 10px 24px rgba(0,0,0,0.22);
      user-select: none;
    }

    #${TOOLBAR_ID} button {
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 8px;
      color: white;
      font: 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: rgba(255,255,255,0.10);
    }

    #${TOOLBAR_ID} button:hover {
      background: rgba(255,255,255,0.18);
    }

    mark.${HIGHLIGHT_CLASS} {
      background: #fde047;
      color: inherit;
      padding: 0 1px;
      border-radius: 2px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function ensureToolbar(onClick) {
  let el = document.getElementById(TOOLBAR_ID);
  if (el) return el;

  el = document.createElement("div");
  el.id = TOOLBAR_ID;
  el.setAttribute(UI_ATTR, "1");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Highlight";
  btn.setAttribute(UI_ATTR, "1");
  btn.addEventListener("click", onClick);

  el.appendChild(btn);
  (document.body || document.documentElement).appendChild(el);
  return el;
}

function isInsideToolbar(target) {
  return Boolean(target?.closest?.(`#${TOOLBAR_ID}`));
}

// ---- SMART POSITIONING (Opera popover friendly) ----
function showToolbarSmart(range, pointer) {
  const el = document.getElementById(TOOLBAR_ID);
  if (!el) return;

  el.style.display = "block";

  const pad = 8;
  const w = el.offsetWidth || 80;
  const h = el.offsetHeight || 28;

  if (pointer && Date.now() - pointer.ts < 1500) {
    let left = pointer.x + 10;
    let top = pointer.y + 12;

    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    return;
  }

  const rect = getRectForRange(range);
  if (!rect) {
    el.style.display = "none";
    return;
  }

  let left = rect.left + rect.width / 2 - w / 2;
  let top = rect.bottom + pad;

  left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
  top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function getRectForRange(range) {
  const rects = range.getClientRects?.();
  if (rects && rects.length > 0) return rects[0];
  const r = range.getBoundingClientRect?.();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return r;
}

// ---- SELECTION VALIDATION ----
function getValidSelectionRange() {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  if (sel.isCollapsed) return null;

  const text = sel.toString();
  if (!text || text.trim().length === 0) return null;

  const range = sel.getRangeAt(0);

  const sc = range.startContainer;
  const ec = range.endContainer;
  const sp = sc?.nodeType === 1 ? sc : sc?.parentElement;
  const ep = ec?.nodeType === 1 ? ec : ec?.parentElement;

  if (isInsideNoTextUI(sp) || isInsideNoTextUI(ep)) return null;
  if (isInsideEditable(sp) || isInsideEditable(ep)) return null;

  return range;
}

function isInsideNoTextUI(el) {
  return Boolean(el?.closest?.(`[${UI_ATTR}]`));
}

function isInsideEditable(el) {
  if (!el) return false;
  return Boolean(
    el.closest?.(
      "input, textarea, [contenteditable='true'], [contenteditable='']",
    ),
  );
}

// ---- APPLY HIGHLIGHT (DOM): TreeWalker + splitText ----
function applyHighlight(range, highlightId) {
  const id = highlightId;
  if (!id) return;

  const nodes = collectTextNodesInRange(range);
  if (nodes.length === 0) return;

  const startNode = range.startContainer;
  const endNode = range.endContainer;

  for (const node of nodes) {
    const fullLen = node.nodeValue?.length ?? 0;
    if (fullLen === 0) continue;

    const isStart = node === startNode;
    const isEnd = node === endNode;

    const startOffset = isStart ? range.startOffset : 0;
    const endOffset = isEnd ? range.endOffset : fullLen;

    if (endOffset <= startOffset) continue;

    const slice = node.nodeValue.slice(startOffset, endOffset);
    if (slice.trim().length === 0) continue;

    wrapTextSlice(node, startOffset, endOffset, id);
  }
}

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
        const value = node.nodeValue;

        if (!value || value.trim().length === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        if (parent.closest("script, style, noscript"))
          return NodeFilter.FILTER_REJECT;
        if (parent.closest(`[${UI_ATTR}]`)) return NodeFilter.FILTER_REJECT;

        // ❗️не підсвічуємо текст всередині вже існуючого хайлайту
        if (parent.closest(`mark.${HIGHLIGHT_CLASS}`))
          return NodeFilter.FILTER_REJECT;

        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    },
    false,
  );

  let n = walker.nextNode();
  while (n) {
    out.push(n);
    n = walker.nextNode();
  }

  return out;
}

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

  node.parentNode.insertBefore(mark, node);
  mark.appendChild(node);
}

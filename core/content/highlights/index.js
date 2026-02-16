// core/content/highlights/index.js
import { makeAnchor } from "./anchor.js";
import {
  getPageUrl,
  createHighlight,
  listHighlights,
  patchHighlight,
  deleteHighlight,
} from "./api.js";
import { restoreRange } from "./restore.js";
import { applyHighlight } from "../dom/applyHighlight.js";
import { createHighlightToolbar } from "../ui/highlightToolbar.js";
import { HIGHLIGHT_CLASS, UI_ATTR, TOOLBAR_ID } from "./constants.js";
import { renderPinMarker, removePinMarker } from "./pins.js";
import {
  initPinsPanel,
  openPinsPanel,
  closePinsPanel,
} from "../ui/pinsPanel.js";

// ---- INTERNAL STATE ----
let lastRange = null;
let lastPointer = null; // { x, y, ts }

let hlEnabled = false;
let pinsEnabled = true;
let initedOnce = false;
let toolbar = null;
let aborter = null;
let raf = null;

let enableBurstToken = 0;

function showToolbarStatus(msg, ms = 1300) {
  if (!toolbar) return;
  toolbar.setStatus(msg);
  if (ms > 0) {
    setTimeout(() => {
      // Do not clear if the toolbar is already hidden (hide() clears it anyway).
      if (toolbar?.isVisible?.()) toolbar.clearStatus();
    }, ms);
  }
}

function clearSelection() {
  const sel = window.getSelection?.();
  sel?.removeAllRanges?.();
}

function setToolbarPinVisible(visible) {
  const btn = document.querySelector(`#${TOOLBAR_ID} [data-role="pin"]`);
  if (!btn) return;
  btn.style.display = visible ? "" : "none";
}

function listExistingHighlightIds() {
  const marks = document.querySelectorAll(`mark.${HIGHLIGHT_CLASS}[data-hid]`);
  const out = new Set();
  for (const m of marks) {
    const id = m.getAttribute("data-hid");
    if (id) out.add(id);
  }
  return out;
}

function unwrapHighlightMarks(highlightId) {
  const marks = document.querySelectorAll(
    `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
  );
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize?.();
  }
}

function removeAllHighlightsFromDom() {
  const ids = listExistingHighlightIds();
  for (const id of ids) {
    unwrapHighlightMarks(id);
    removePinMarker(id);
  }
}

function removeAllPinMarkersFromDom() {
  const ids = listExistingHighlightIds();
  for (const id of ids) removePinMarker(id);
}

function scheduleEnableSyncBurst() {
  const token = ++enableBurstToken;
  const delays = [0, 250, 1000];
  for (const ms of delays) {
    setTimeout(() => {
      if (!hlEnabled) return;
      if (token !== enableBurstToken) return;
      void syncHighlightsFromStore().catch(() => { });
    }, ms);
  }
}

function attachListeners() {
  if (!toolbar) return;
  aborter = new AbortController();
  const signal = aborter.signal;

  document.addEventListener(
    "selectionchange",
    () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = null;

        const range = getValidSelectionRange(toolbar);
        if (!range) {
          if (toolbar.isVisible()) return;
          lastRange = null;
          toolbar.hide();
          return;
        }

        lastRange = range.cloneRange();
      });
    },
    { capture: true, signal }
  );

  document.addEventListener(
    "mouseup",
    (e) => {
      lastPointer = { x: e.clientX, y: e.clientY, ts: Date.now() };

      const range = getValidSelectionRange(toolbar);
      if (!range) {
        if (toolbar.isVisible()) return;
        toolbar.hide();
        return;
      }

      lastRange = range.cloneRange();
      toolbar.showNearRange(lastRange, lastPointer);
    },
    { capture: true, signal }
  );

  document.addEventListener(
    "keyup",
    (e) => {
      if (!["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        return;
      }

      const range = getValidSelectionRange(toolbar);
      if (!range) {
        if (toolbar.isVisible()) return;
        toolbar.hide();
        return;
      }

      lastRange = range.cloneRange();
      toolbar.showNearRange(lastRange, null);
    },
    { capture: true, signal }
  );

  document.addEventListener(
    "mousedown",
    (e) => {
      if (toolbar.isEventInsideUI(e.target)) return;
      toolbar.hide();
    },
    { capture: true, signal }
  );
}

function detachListeners() {
  enableBurstToken++;
  if (raf) {
    cancelAnimationFrame(raf);
    raf = null;
  }
  aborter?.abort?.();
  aborter = null;
}

function initHighlightsOnce() {
  if (initedOnce) return;
  initedOnce = true;

  toolbar = createHighlightToolbar({
    onHighlight: async () => {
      const res = await createAndApplyHighlight({ pinned: false });
      if (res?.keepOpen) {
        showToolbarStatus(res.message || "Cannot highlight");
        return;
      }
      toolbar.clearStatus();
      toolbar.hide();
    },
    onPin: async () => {
      const res = await pinSelection();
      if (res?.keepOpen) {
        showToolbarStatus(res.message || "Cannot pin");
        return;
      }
      toolbar.clearStatus();
      toolbar.hide();
    },
    onRemove: async () => {
      const res = await removeSelectionHighlights();
      if (res?.keepOpen) {
        showToolbarStatus(res.message || "Nothing to remove");
        return;
      }
      toolbar.clearStatus();
      toolbar.hide();
    },
  });

  toolbar.hide();
  setToolbarPinVisible(pinsEnabled);

  scheduleRestoreWithRetries();
}

// ---- PUBLIC API (live gating) ----
export async function setPinsEnabled(enabled) {
  pinsEnabled = Boolean(enabled);

  if (pinsEnabled) {
    try {
      initPinsPanel();
    } catch {
      // ignore
    }
  }

  setToolbarPinVisible(pinsEnabled);

  if (!pinsEnabled) {
    removeAllPinMarkersFromDom();
    closePinsPanel();
    return { ok: true, enabled: false };
  }

  if (hlEnabled) {
    await syncHighlightsFromStore().catch(() => { });
  }

  return { ok: true, enabled: true };
}

export async function setHighlightsEnabled(enabled) {
  const next = Boolean(enabled);
  if (hlEnabled === next) return { ok: true, enabled: hlEnabled };

  if (!next) {
    // pins не можуть жити без highlights
    await setPinsEnabled(false).catch(() => { });

    hlEnabled = false;
    detachListeners();
    toolbar?.hide?.();
    lastRange = null;
    lastPointer = null;
    clearSelection();
    removeAllHighlightsFromDom();
    closePinsPanel();
    return { ok: true, enabled: false };
  }

  hlEnabled = true;
  initHighlightsOnce();
  setToolbarPinVisible(pinsEnabled);
  attachListeners();
  scheduleEnableSyncBurst();
  return { ok: true, enabled: true };
}

// Backward-compatible init (older code paths)
export function initHighlights() {
  void setHighlightsEnabled(true);
}

// ---- ACTIONS ----
async function createAndApplyHighlight({ pinned }) {
  if (!hlEnabled) return { keepOpen: true, message: "Highlights are disabled" };
  if (!lastRange) return { keepOpen: true, message: "No selection" };

  const r = lastRange.cloneRange();

  // якщо виділення вже накриває highlight — не плодимо дубль
  if (getHighlightIdsInRange(r).length > 0) {
    return {
      keepOpen: true,
      message: "Already highlighted. Use Pin/Remove.",
    };
  }

  const anchor = makeAnchor(r);
  const exact = anchor?.quote?.exact || "";
  if (exact.trim().length === 0) {
    return { keepOpen: true, message: "Empty selection" };
  }

  const pageUrl = getPageUrl();

  const created = await createHighlight({
    pageUrl,
    color: "yellow",
    anchor,
    pinned: Boolean(pinned),
    noteText: "",
  });

  if (!created?.ok || !created?.highlight?.id) {
    console.warn("[highlights] create failed:", created?.error);
    return { keepOpen: true, message: "Create failed" };
  }

  const highlightId = created.highlight.id;

  applyHighlight(r, highlightId);

  if (pinned && pinsEnabled) {
    renderPinMarker(highlightId);
    openPinsPanel({ focusId: highlightId });
  }

  lastRange = null;
  clearSelection();
  return { keepOpen: false };
}

function getClosestHighlightMark(node) {
  if (!node) return null;
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el) return null;

  const sel = `mark.${HIGHLIGHT_CLASS}[data-hid]`;
  if (el.matches?.(sel)) return el;
  return el.closest?.(sel) || null;
}

function getMarksInRange(range) {
  if (!range) return [];

  const ancestor =
    range.commonAncestorContainer?.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer?.parentElement;

  const root = ancestor || document.body;
  const selector = `mark.${HIGHLIGHT_CLASS}[data-hid]`;

  const marks = Array.from(root.querySelectorAll(selector));

  if (root.matches?.(selector)) marks.push(root);

  const m1 = getClosestHighlightMark(range.startContainer);
  const m2 = getClosestHighlightMark(range.endContainer);
  if (m1) marks.push(m1);
  if (m2) marks.push(m2);

  const hit = [];
  const seen = new Set();
  for (const m of marks) {
    const id = m?.getAttribute?.("data-hid");
    if (!id || seen.has(id)) continue;
    try {
      if (range.intersectsNode(m)) {
        hit.push(m);
        seen.add(id);
      }
    } catch {
      // ignore
    }
  }

  return hit;
}

function getHighlightIdsInRange(range) {
  const marks = getMarksInRange(range);
  const ids = marks.map((m) => m.getAttribute("data-hid")).filter(Boolean);
  return Array.from(new Set(ids));
}

async function getStoredHighlightById(pageUrl, id) {
  const res = await listHighlights({ pageUrl });
  if (!res?.ok) return null;
  const list = Array.isArray(res.highlights) ? res.highlights : [];
  return list.find((h) => h?.id === id) || null;
}

async function pinSelection() {
  if (!hlEnabled) return { keepOpen: true, message: "Highlights are disabled" };
  if (!pinsEnabled) return { keepOpen: true, message: "Pins are disabled" };
  if (!lastRange) return { keepOpen: true, message: "No selection" };

  const r = lastRange.cloneRange();
  const pageUrl = getPageUrl();

  const ids = getHighlightIdsInRange(r);

  if (ids.length > 1) {
    return { keepOpen: true, message: "Multiple highlights selected" };
  }

  if (ids.length === 1) {
    const id = ids[0];
    const stored = await getStoredHighlightById(pageUrl, id);
    const nextPinned = !Boolean(stored?.pinned);

    const patched = await patchHighlight({
      pageUrl,
      id,
      patch: { pinned: nextPinned },
    });

    if (!patched?.ok) {
      console.warn("[highlights] pin patch failed:", patched?.error);
      return { keepOpen: true, message: "Pin failed" };
    }

    await syncHighlightsFromStore();

    if (nextPinned) openPinsPanel({ focusId: id });

    lastRange = null;
    clearSelection();
    return { keepOpen: false };
  }

  // ids.length === 0 => create pinned highlight
  return await createAndApplyHighlight({ pinned: true });
}

async function removeSelectionHighlights() {
  if (!hlEnabled) return { keepOpen: true, message: "Highlights are disabled" };
  if (!lastRange) return { keepOpen: true, message: "No selection" };

  const r = lastRange.cloneRange();
  const pageUrl = getPageUrl();

  const ids = getHighlightIdsInRange(r);
  if (ids.length === 0) {
    return { keepOpen: true, message: "No highlight found in selection" };
  }

  for (const id of ids) {
    const res = await deleteHighlight({ pageUrl, id });
    if (!res?.ok) {
      console.warn("[highlights] delete failed:", id, res?.error);
      continue;
    }
    unwrapHighlightMarks(id);
    removePinMarker(id);
  }

  await syncHighlightsFromStore();
  lastRange = null;
  clearSelection();
  return { keepOpen: false };
}

// ---- RESTORE / SYNC ----
function hasHighlightAlready(id) {
  if (!id) return false;
  return Boolean(
    document.querySelector(`mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`)
  );
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

export async function syncHighlightsFromStore() {
  if (!hlEnabled) return { ok: true, skipped: true };

  const pageUrl = getPageUrl();
  const res = await listHighlights({ pageUrl });
  if (!res?.ok) return { ok: false, error: res?.error || "list failed" };

  const list = Array.isArray(res.highlights) ? res.highlights : [];
  const byId = new Map();
  for (const h of list) {
    if (h?.id) byId.set(h.id, h);
  }

  const existingIds = listExistingHighlightIds();
  for (const id of existingIds) {
    if (!byId.has(id)) {
      unwrapHighlightMarks(id);
      removePinMarker(id);
    }
  }

  const planned = [];
  for (const h of list) {
    const id = h?.id;
    if (!id || hasHighlightAlready(id)) continue;
    const r = restoreRange(h?.anchor);
    if (r) planned.push({ id, range: r.cloneRange() });
  }

  planned.sort(compareRanges);
  for (let i = planned.length - 1; i >= 0; i--) {
    const item = planned[i];
    if (hasHighlightAlready(item.id)) continue;
    applyHighlight(item.range, item.id);
  }

  for (const h of list) {
    const id = h?.id;
    if (!id) continue;
    if (pinsEnabled && h?.pinned) renderPinMarker(id);
    else removePinMarker(id);
  }

  return { ok: true, total: list.length, applied: planned.length };
}

function scheduleRestoreWithRetries() {
  const delays = [0, 250, 1000, 2500, 5000];

  delays.forEach((ms) => {
    setTimeout(async () => {
      try {
        await syncHighlightsFromStore();
      } catch (e) {
        console.warn("[hl] restore failed:", e);
      }
    }, ms);
  });

  window.addEventListener(
    "load",
    () => {
      setTimeout(() => syncHighlightsFromStore().catch(() => { }), 0);
    },
    { once: true }
  );
}

// ---- SELECTION VALIDATION ----
function getValidSelectionRange(toolbarApi) {
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

  if (toolbarApi.isEventInsideUI(sp) || toolbarApi.isEventInsideUI(ep)) return null;
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
    el.closest?.("input, textarea, [contenteditable='true'], [contenteditable='']")
  );
}

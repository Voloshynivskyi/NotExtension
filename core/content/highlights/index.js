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

// Context-menu fallback: remember the last right-clicked highlight (works even when selection is collapsed).
let lastContextMenuHighlightIds = [];
let lastContextMenuTs = 0;

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

function compareRanges(a, b) {
  try {
    if (a.range.compareBoundaryPoints(Range.START_TO_START, b.range) < 0) return -1;
    if (a.range.compareBoundaryPoints(Range.START_TO_START, b.range) > 0) return 1;
  } catch {
    // ignore
  }
  return 0;
}

function hasHighlightAlready(id) {
  const sel = `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`;
  return Boolean(document.querySelector(sel));
}

function attachListeners() {
  if (!toolbar) return;
  aborter = new AbortController();
  const signal = aborter.signal;

  document.addEventListener(
    "contextmenu",
    (e) => {
      // Save highlight id under the cursor to support actions without an active selection.
      const mark = getClosestHighlightMark(e.target);
      const id = mark?.getAttribute?.("data-hid") || "";
      if (id) {
        lastContextMenuHighlightIds = [id];
        lastContextMenuTs = Date.now();
      } else {
        lastContextMenuHighlightIds = [];
        lastContextMenuTs = Date.now();
      }
    },
    { capture: true, signal }
  );

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
      toolbar.hide();
    },
    onPin: async () => {
      const res = await pinSelection();
      if (res?.keepOpen) {
        showToolbarStatus(res.message || "Cannot pin");
        return;
      }
      toolbar.hide();
    },
    onRemove: async () => {
      const res = await removeSelectionHighlights();
      if (res?.keepOpen) {
        showToolbarStatus(res.message || "Cannot remove");
        return;
      }
      toolbar.hide();
    },
    onOpenPins: () => {
      openPinsPanel({});
      toolbar.hide();
    },
  });

  // Pins panel init (lazy UI)
  initPinsPanel({
    onRequestUnpin: async (id) => {
      const pageUrl = getPageUrl();
      await patchHighlight({ pageUrl, id, patch: { pinned: false } }).catch(() => { });
      await syncHighlightsFromStore().catch(() => { });
    },
    onRequestDelete: async (id) => {
      const pageUrl = getPageUrl();
      await deleteHighlight({ pageUrl, id }).catch(() => { });
      await syncHighlightsFromStore().catch(() => { });
    },
    onRequestPatch: async (id, patch) => {
      const pageUrl = getPageUrl();
      await patchHighlight({ pageUrl, id, patch }).catch(() => { });
      await syncHighlightsFromStore().catch(() => { });
    },
  });
}

export async function setPinsEnabled(enabled) {
  const next = Boolean(enabled);
  if (pinsEnabled === next) return { ok: true, enabled: pinsEnabled };

  pinsEnabled = next;

  // Pins cannot exist without highlights (UI correctness)
  if (!hlEnabled && pinsEnabled) pinsEnabled = false;

  setToolbarPinVisible(pinsEnabled);

  if (!pinsEnabled) {
    closePinsPanel();
    removeAllPinMarkersFromDom();
  } else if (hlEnabled) {
    // pins on -> rerender pins
    await syncHighlightsFromStore().catch(() => { });
  }

  return { ok: true, enabled: pinsEnabled };
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

// Used by background context-menu actions.
// Returns either:
// - { ok:true, kind:"existing", pageUrl, highlightIds:[...] }
// - { ok:true, kind:"new", pageUrl, anchor }
// - { ok:false, kind:"none", pageUrl, error }
export function captureSelectionForContextMenu() {
  const pageUrl = getPageUrl();

  // 1) Prefer current selection if it exists.
  const sel = window.getSelection?.();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const text = sel.toString?.() || "";
    const range = sel.getRangeAt(0);

    // If selection intersects existing highlight(s), treat it as "existing".
    const ids = getHighlightIdsInRange(range);
    if (ids.length > 0) {
      return { ok: true, kind: "existing", pageUrl, highlightIds: ids };
    }

    // Otherwise, create a new anchor.
    if (text.trim().length > 0) {
      const anchor = makeAnchor(range);
      const exact = anchor?.quote?.exact || "";
      if (exact.trim().length > 0) {
        return { ok: true, kind: "new", pageUrl, anchor };
      }
    }
  }

  // 2) Fallback: last right-clicked highlight (works when selection is collapsed).
  if (
    Array.isArray(lastContextMenuHighlightIds) &&
    lastContextMenuHighlightIds.length > 0 &&
    Date.now() - lastContextMenuTs < 3000
  ) {
    return {
      ok: true,
      kind: "existing",
      pageUrl,
      highlightIds: lastContextMenuHighlightIds.slice(),
    };
  }

  return { ok: false, kind: "none", pageUrl, error: "No selection/highlight" };
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
  const ids = getHighlightIdsInRange(r);

  if (ids.length === 0) return { keepOpen: true, message: "No highlight selected" };

  if (ids.length > 1) return { keepOpen: true, message: "Multiple highlights selected" };

  const pageUrl = getPageUrl();
  const id = ids[0];

  const del = await deleteHighlight({ pageUrl, id });
  if (!del?.ok) {
    console.warn("[highlights] delete failed:", del?.error);
    return { keepOpen: true, message: "Remove failed" };
  }

  await syncHighlightsFromStore();

  lastRange = null;
  clearSelection();
  return { keepOpen: false };
}

export async function syncHighlightsFromStore() {
  if (!hlEnabled) return { ok: true, total: 0, applied: 0, disabled: true };

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

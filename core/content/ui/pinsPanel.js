// File: core/content/ui/pinsPanel.js
// Purpose: Render and manage the pinned highlights panel UI in the page.
import {
  UI_ATTR,
  Z_INDEX,
  HIGHLIGHT_CLASS,
  PINS_PANEL_ID,
  PINS_PANEL_STYLE_ID,
  HIGHLIGHT_FLASH_CLASS,
} from "../highlights/constants.js";

import {
  getPageUrl,
  listHighlights,
  patchHighlight,
  deleteHighlight,
} from "../highlights/api.js";
import { removePinMarker } from "../highlights/pins.js";

let panelEl = null;
let bodyEl = null;
let isOpen = false;

// Debounce map: highlight id -> timeout handle.
const noteTimers = new Map();

function ensureStyle() {
  if (document.getElementById(PINS_PANEL_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PINS_PANEL_STYLE_ID;
  style.textContent = `
    #${PINS_PANEL_ID} {
      --pin-bg: #ffffff;
      --pin-surface: #f6f4ff;
      --pin-surface-strong: #f0edff;
      --pin-border: rgba(53, 52, 52, 0.16);
      --pin-text: #353434;
      --pin-muted: #4c4b4b;
      --pin-accent: #6e5dd0;
      --pin-accent-2: #7766dc;
      --pin-danger: #dc2626;

      position: fixed;
      top: 12px;
      right: 12px;
      width: 360px;
      height: calc(100vh - 24px);
      z-index: ${Z_INDEX};
      display: none;
      background: linear-gradient(180deg, var(--pin-bg) 0%, var(--pin-surface) 100%);
      color: var(--pin-text);
      border-radius: 14px;
      border: 1px solid var(--pin-border);
      box-shadow: 0 16px 40px rgba(53, 52, 52, 0.18);
      overflow: hidden;
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    #${PINS_PANEL_ID} * { box-sizing: border-box; }

    #${PINS_PANEL_ID} .hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 10px;
      background: var(--pin-surface-strong);
      border-bottom: 1px solid var(--pin-border);
    }

    #${PINS_PANEL_ID} .title {
      font-weight: 650;
      letter-spacing: 0.2px;
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--pin-text);
    }

    #${PINS_PANEL_ID} .close {
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 10px;
      color: var(--pin-text);
      border: 1px solid var(--pin-border);
      background: #fff;
      transition: border-color 140ms ease, transform 140ms ease;
    }
    #${PINS_PANEL_ID} .close:hover {
      border-color: rgba(110, 93, 208, 0.55);
      transform: translateY(-1px);
    }

    #${PINS_PANEL_ID} .body {
      padding: 10px;
      height: calc(100% - 48px);
      overflow: auto;
    }

    #${PINS_PANEL_ID} .item {
      padding: 10px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid var(--pin-border);
      margin-bottom: 10px;
    }

    #${PINS_PANEL_ID} .quote {
      color: var(--pin-text);
      font-size: 12px;
      margin-bottom: 8px;
      word-break: break-word;
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid transparent;
    }
    #${PINS_PANEL_ID} .quote.clickable{
      cursor: pointer;
    }
    #${PINS_PANEL_ID} .quote.clickable:hover{
      border-color: rgba(110, 93, 208, 0.35);
      background: rgba(110, 93, 208, 0.06);
    }

    #${PINS_PANEL_ID} .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--pin-muted);
      font-size: 11px;
      min-height: 16px;
    }

    #${PINS_PANEL_ID} textarea {
      width: 100%;
      min-height: 78px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid var(--pin-border);
      background: #ffffff;
      color: var(--pin-text);
      padding: 8px 10px;
      outline: none;
    }
    #${PINS_PANEL_ID} textarea:focus {
      border-color: rgba(110, 93, 208, 0.55);
      box-shadow: 0 0 0 2px rgba(110, 93, 208, 0.12);
    }

    #${PINS_PANEL_ID} .row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    #${PINS_PANEL_ID} .btn {
      all: unset;
      cursor: pointer;
      padding: 7px 10px;
      border-radius: 10px;
      background: var(--pin-accent);
      color: #fff;
      font-size: 12px;
      user-select: none;
      border: 1px solid transparent;
      transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
      text-align: center;
      flex: 1 1 auto;
    }
    #${PINS_PANEL_ID} .btn:hover {
      background: var(--pin-accent-2);
      transform: translateY(-1px);
    }
    #${PINS_PANEL_ID} .btn.ghost{
      background: #fff;
      color: var(--pin-text);
      border: 1px solid var(--pin-border);
    }
    #${PINS_PANEL_ID} .btn.ghost:hover{
      background: #f9fafb;
      transform: translateY(-1px);
      border-color: rgba(110, 93, 208, 0.35);
    }
    #${PINS_PANEL_ID} .btn.danger {
      background: var(--pin-danger);
    }
    #${PINS_PANEL_ID} .btn.danger:hover {
      background: #b91c1c;
    }

    #${PINS_PANEL_ID} .muted {
      color: var(--pin-muted);
      font-size: 12px;
      padding: 10px;
      border: 1px dashed rgba(110, 93, 208, 0.35);
      border-radius: 12px;
    }

    /* flash on jump */
    mark.${HIGHLIGHT_FLASH_CLASS} {
      outline: 2px solid rgba(59, 130, 246, 0.95);
      outline-offset: 1px;
      animation: notextFlash 900ms ease-out 1;
    }
    @keyframes notextFlash {
      0% { outline-color: rgba(59,130,246,1); }
      100% { outline-color: rgba(59,130,246,0); }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function ensurePanel() {
  if (panelEl && document.contains(panelEl)) return panelEl;

  ensureStyle();

  panelEl = document.createElement("div");
  panelEl.id = PINS_PANEL_ID;
  panelEl.setAttribute(UI_ATTR, "1");

  const hdr = document.createElement("div");
  hdr.className = "hdr";
  hdr.setAttribute(UI_ATTR, "1");

  const title = document.createElement("div");
  title.className = "title";
  title.setAttribute(UI_ATTR, "1");
  title.textContent = "Pins";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.setAttribute(UI_ATTR, "1");
  close.textContent = "Close";
  close.addEventListener("click", () => closePinsPanel());

  hdr.appendChild(title);
  hdr.appendChild(close);

  bodyEl = document.createElement("div");
  bodyEl.className = "body";
  bodyEl.setAttribute(UI_ATTR, "1");

  panelEl.appendChild(hdr);
  panelEl.appendChild(bodyEl);

  (document.body || document.documentElement).appendChild(panelEl);

  window.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") closePinsPanel();
  });

  return panelEl;
}

function getMarkEls(highlightId) {
  return Array.from(
    document.querySelectorAll(
      `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
    )
  );
}

function getFirstMarkEl(highlightId) {
  return document.querySelector(
    `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
  );
}

// More stable visual position: min(top), then min(left) among all marks.
function getVisualPos(highlightId) {
  const els = getMarkEls(highlightId);
  if (!els || els.length === 0) return null;

  let best = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const p = { top: r.top + window.scrollY, left: r.left + window.scrollX };
    if (!best) {
      best = p;
      continue;
    }
    const lineThreshold = 8;
    if (p.top < best.top - lineThreshold) best = p;
    else if (Math.abs(p.top - best.top) <= lineThreshold && p.left < best.left) best = p;
  }
  return best;
}

function compareReadingOrder(a, b) {
  const ap = a._pos;
  const bp = b._pos;

  // unresolved last
  if (!ap && !bp) return (a.createdAt || 0) - (b.createdAt || 0);
  if (!ap) return 1;
  if (!bp) return -1;

  const lineThreshold = 10;
  if (Math.abs(ap.top - bp.top) > lineThreshold) return ap.top - bp.top;
  return ap.left - bp.left;
}

function truncate(s, n = 120) {
  const v = String(s || "").replace(/\s+/g, " ").trim();
  if (v.length <= n) return v;
  return v.slice(0, n - 1) + "…";
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

function flashAndScrollTo(highlightId) {
  const el = getFirstMarkEl(highlightId);
  if (!el) return false;

  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

  const marks = document.querySelectorAll(
    `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
  );
  marks.forEach((m) => m.classList.add(HIGHLIGHT_FLASH_CLASS));
  setTimeout(() => {
    marks.forEach((m) => m.classList.remove(HIGHLIGHT_FLASH_CLASS));
  }, 950);

  return true;
}

async function loadPinnedList() {
  const pageUrl = getPageUrl();
  const res = await listHighlights({ pageUrl });
  if (!res?.ok) return { ok: false, error: res?.error || "list failed", list: [] };

  const all = Array.isArray(res.highlights) ? res.highlights : [];
  const pinned = all.filter((h) => Boolean(h?.pinned));

  for (const h of pinned) {
    h._pos = getVisualPos(h.id);
  }

  pinned.sort(compareReadingOrder);
  return { ok: true, pageUrl, list: pinned };
}

function scheduleNotePatch({ pageUrl, id, noteText, onStatus }) {
  if (!pageUrl || !id) return;

  const prev = noteTimers.get(id);
  if (prev) clearTimeout(prev);

  const t = setTimeout(async () => {
    try {
      onStatus?.("Saving…");
      const res = await patchHighlight({
        pageUrl,
        id,
        patch: { noteText },
      });
      if (!res?.ok) onStatus?.("Save failed");
      else onStatus?.("Saved");
      setTimeout(() => onStatus?.(""), 700);
    } catch {
      onStatus?.("Save failed");
    }
  }, 450);

  noteTimers.set(id, t);
}

async function unpinHighlight({ pageUrl, id, onStatus }) {
  try {
    onStatus?.("Unpinning…");
    const res = await patchHighlight({ pageUrl, id, patch: { pinned: false } });
    if (!res?.ok) {
      onStatus?.("Unpin failed");
      return false;
    }
    removePinMarker(id);
    onStatus?.("");
    return true;
  } catch {
    onStatus?.("Unpin failed");
    return false;
  }
}

function renderList({ pageUrl, list }) {
  if (!bodyEl) return;

  bodyEl.innerHTML = "";

  if (!list || list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.setAttribute(UI_ATTR, "1");
    empty.textContent = "No pinned notes found on this page.";
    bodyEl.appendChild(empty);
    return;
  }

  for (const h of list) {
    const item = document.createElement("div");
    item.className = "item";
    item.setAttribute(UI_ATTR, "1");
    item.setAttribute("data-hid", h.id);

    const quote = document.createElement("div");
    quote.className = `quote ${h._pos ? "clickable" : ""}`;
    quote.setAttribute(UI_ATTR, "1");
    quote.textContent = truncate(h?.anchor?.quote?.exact || "", 160) || "—";
    quote.title = h._pos ? "Click to jump to highlight" : "Unable to find position on page";
    quote.tabIndex = h._pos ? 0 : -1;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.setAttribute(UI_ATTR, "1");

    const left = document.createElement("span");
    left.setAttribute(UI_ATTR, "1");
    left.textContent = h._pos ? "Position: resolved" : "Position: unresolved";

    const status = document.createElement("span");
    status.setAttribute(UI_ATTR, "1");
    status.textContent = "";

    meta.appendChild(left);
    meta.appendChild(status);

    const ta = document.createElement("textarea");
    ta.setAttribute(UI_ATTR, "1");
    ta.value = typeof h.noteText === "string" ? h.noteText : "";
    ta.placeholder = "Note for this pin…";

    ta.addEventListener("input", () => {
      const txt = ta.value;
      scheduleNotePatch({
        pageUrl,
        id: h.id,
        noteText: txt,
        onStatus: (s) => (status.textContent = s),
      });
    });

    const go = () => {
      if (!h._pos) {
        status.textContent = "Position unresolved";
        setTimeout(() => (status.textContent = ""), 900);
        return;
      }
      flashAndScrollTo(h.id);
    };

    if (h._pos) {
      quote.addEventListener("click", go);
      quote.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
    }

    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute(UI_ATTR, "1");

    const btnGo = document.createElement("button");
    btnGo.type = "button";
    btnGo.className = "btn";
    btnGo.setAttribute(UI_ATTR, "1");
    btnGo.textContent = "Go to";
    btnGo.disabled = !h._pos;
    btnGo.title = h._pos ? "Scroll to highlight" : "Unable to find position on page";
    btnGo.addEventListener("click", go);

    const btnUnpin = document.createElement("button");
    btnUnpin.type = "button";
    btnUnpin.className = "btn ghost";
    btnUnpin.setAttribute(UI_ATTR, "1");
    btnUnpin.textContent = "Unpin";
    btnUnpin.addEventListener("click", async () => {
      const ok = await unpinHighlight({
        pageUrl,
        id: h.id,
        onStatus: (s) => (status.textContent = s),
      });
      if (ok) await refreshPinsPanel();
    });

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn danger";
    btnDel.setAttribute(UI_ATTR, "1");
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", async () => {
      try {
        status.textContent = "Deleting…";
        const res = await deleteHighlight({ pageUrl, id: h.id });
        if (!res?.ok) {
          status.textContent = "Delete failed";
          return;
        }
        unwrapHighlightMarks(h.id);
        removePinMarker(h.id);
        await refreshPinsPanel();
      } catch {
        status.textContent = "Delete failed";
      }
    });

    row.appendChild(btnGo);
    row.appendChild(btnUnpin);
    row.appendChild(btnDel);

    item.appendChild(quote);
    item.appendChild(meta);
    item.appendChild(ta);
    item.appendChild(row);

    bodyEl.appendChild(item);
  }
}

export async function refreshPinsPanel() {
  ensurePanel();

  let focusState = null;
  if (isOpen) {
    const active = document.activeElement;
    if (active && active.tagName === "TEXTAREA" && panelEl?.contains(active)) {
      const item = active.closest("[data-hid]");
      const id = item?.getAttribute?.("data-hid") || "";
      if (id) {
        focusState = {
          id,
          start: active.selectionStart,
          end: active.selectionEnd,
          scrollTop: active.scrollTop,
        };
      }
    }
  }

  const loaded = await loadPinnedList();
  if (!loaded.ok) {
    bodyEl.innerHTML = "";
    const err = document.createElement("div");
    err.className = "muted";
    err.setAttribute(UI_ATTR, "1");
    err.textContent = "Failed to load pinned notes.";
    bodyEl.appendChild(err);
    return { ok: false };
  }

  renderList({ pageUrl: loaded.pageUrl, list: loaded.list });

  if (focusState) {
    requestAnimationFrame(() => {
      const item = panelEl?.querySelector?.(
        `[data-hid="${CSS.escape(focusState.id)}"]`
      );
      const ta = item?.querySelector?.("textarea");
      if (!ta) return;
      ta.focus();
      if (typeof focusState.start === "number" && typeof focusState.end === "number") {
        ta.setSelectionRange(focusState.start, focusState.end);
      }
      if (typeof focusState.scrollTop === "number") {
        ta.scrollTop = focusState.scrollTop;
      }
    });
  }
  return { ok: true };
}

export async function openPinsPanel({ focusId } = {}) {
  ensurePanel();

  panelEl.style.display = "block";
  isOpen = true;

  await refreshPinsPanel();

  if (focusId) {
    requestAnimationFrame(() => {
      const item = panelEl.querySelector(
        `[data-hid="${CSS.escape(focusId)}"]`
      );
      const ta = item?.querySelector?.("textarea");
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        item.scrollIntoView({ block: "nearest" });
      }

      // Extra UX: also flash-scroll on the page (best-effort)
      setTimeout(() => {
        flashAndScrollTo(focusId);
      }, 80);
    });
  }
}

export function closePinsPanel() {
  if (!panelEl) return;
  panelEl.style.display = "none";
  isOpen = false;
}

export function initPinsPanel() {
  ensurePanel();
}

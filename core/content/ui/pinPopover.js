// core/content/ui/pinPopover.js
import { UI_ATTR, HIGHLIGHT_CLASS, PIN_CLASS } from "../highlights/constants.js";
import { getPageUrl, listHighlights, patchHighlight, deleteHighlight } from "../highlights/api.js";
import { removePinMarker } from "../highlights/pins.js";
import { openPinsPanel } from "./pinsPanel.js";

const POPOVER_ID = "notext-pin-popover";
const POPOVER_STYLE_ID = "notext-pin-popover-style";

let el = null;
let state = {
  open: false,
  highlightId: null,
  anchorEl: null,
  pageUrl: null,
};

const noteTimers = new Map();

function ensureStyle() {
  if (document.getElementById(POPOVER_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = POPOVER_STYLE_ID;
  style.textContent = `
    #${POPOVER_ID}{
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      max-width: calc(100vw - 16px);
      background: #ffffff;
      border: 1px solid rgba(53, 52, 52, 0.18);
      box-shadow: 0 16px 40px rgba(53, 52, 52, 0.22);
      border-radius: 14px;
      overflow: hidden;
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111827;
      display: none;
    }
    #${POPOVER_ID} *{ box-sizing: border-box; }
    #${POPOVER_ID} .hdr{
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 10px 10px;
      background: #f6f4ff;
      border-bottom: 1px solid rgba(53, 52, 52, 0.14);
    }
    #${POPOVER_ID} .ttl{
      font-weight: 650;
      display:flex;
      align-items:center;
      gap: 8px;
    }
    #${POPOVER_ID} .x{
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid rgba(53, 52, 52, 0.16);
      background: #fff;
    }
    #${POPOVER_ID} .x:hover{
      border-color: rgba(110, 93, 208, 0.55);
    }
    #${POPOVER_ID} .body{
      padding: 10px;
    }
    #${POPOVER_ID} textarea{
      width: 100%;
      min-height: 86px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid rgba(53, 52, 52, 0.16);
      background: #ffffff;
      color: #111827;
      padding: 8px 10px;
      outline: none;
    }
    #${POPOVER_ID} textarea:focus{
      border-color: rgba(110, 93, 208, 0.55);
      box-shadow: 0 0 0 2px rgba(110, 93, 208, 0.12);
    }
    #${POPOVER_ID} .meta{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 10px;
      margin-top: 8px;
      color: #4b5563;
      font-size: 11px;
      min-height: 16px;
    }
    #${POPOVER_ID} .row{
      display:flex;
      gap: 8px;
      margin-top: 10px;
    }
    #${POPOVER_ID} .btn{
      all: unset;
      cursor: pointer;
      padding: 7px 10px;
      border-radius: 10px;
      background: #6e5dd0;
      color: #fff;
      font-size: 12px;
      user-select: none;
      border: 1px solid transparent;
      transition: transform 140ms ease, background 140ms ease;
    }
    #${POPOVER_ID} .btn:hover{ background:#7766dc; transform: translateY(-1px); }
    #${POPOVER_ID} .btn.ghost{
      background: #fff;
      color:#111827;
      border: 1px solid rgba(53, 52, 52, 0.16);
    }
    #${POPOVER_ID} .btn.ghost:hover{
      background:#f9fafb;
      transform: translateY(-1px);
    }
    #${POPOVER_ID} .btn.danger{
      background:#dc2626;
    }
    #${POPOVER_ID} .btn.danger:hover{
      background:#b91c1c;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function ensureEl() {
  if (el && document.contains(el)) return el;
  ensureStyle();

  el = document.createElement("div");
  el.id = POPOVER_ID;
  el.setAttribute(UI_ATTR, "1");

  el.innerHTML = `
    <div class="hdr" ${UI_ATTR}="1">
      <div class="ttl" ${UI_ATTR}="1">📌 Pin note</div>
      <button class="x" type="button" ${UI_ATTR}="1" aria-label="Close" title="Close">Close</button>
    </div>
    <div class="body" ${UI_ATTR}="1">
      <textarea ${UI_ATTR}="1" placeholder="Write a note…"></textarea>
      <div class="meta" ${UI_ATTR}="1">
        <span class="status" ${UI_ATTR}="1"></span>
        <span class="hint" ${UI_ATTR}="1">Shift+Click pin → open list</span>
      </div>
      <div class="row" ${UI_ATTR}="1">
        <button class="btn ghost openlist" type="button" ${UI_ATTR}="1">Open list</button>
        <button class="btn ghost unpin" type="button" ${UI_ATTR}="1">Unpin</button>
        <button class="btn danger del" type="button" ${UI_ATTR}="1">Delete</button>
      </div>
    </div>
  `;

  (document.body || document.documentElement).appendChild(el);

  el.querySelector(".x")?.addEventListener("click", () => closePinPopover());

  return el;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

function positionNearAnchor(anchorEl) {
  if (!anchorEl || !el) return;

  const rect = anchorEl.getBoundingClientRect();
  const pad = 8;

  // place below-right by default
  let left = rect.right + 8;
  let top = rect.top;

  el.style.display = "block";
  const w = el.offsetWidth || 320;
  const h = el.offsetHeight || 220;

  // if overflow right, place to left
  if (left + w + pad > window.innerWidth) {
    left = rect.left - w - 8;
  }

  // if still overflow, center near rect
  left = clamp(left, pad, window.innerWidth - w - pad);

  // vertical clamp
  top = clamp(top, pad, window.innerHeight - h - pad);

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function clearTimer(id) {
  const t = noteTimers.get(id);
  if (t) clearTimeout(t);
  noteTimers.delete(id);
}

async function fetchHighlight(pageUrl, id) {
  const res = await listHighlights({ pageUrl });
  if (!res?.ok) return null;
  const list = Array.isArray(res.highlights) ? res.highlights : [];
  return list.find((h) => h?.id === id) || null;
}

function unwrapHighlightMarks(id) {
  const marks = document.querySelectorAll(
    `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(id)}"]`
  );
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize?.();
  }
}

function attachGlobalCloseHandlers() {
  // click outside
  const onDown = (e) => {
    if (!state.open) return;
    const t = e.target;
    if (el?.contains(t)) return;

    // ignore clicking pin itself (pins.js handles opening)
    if (t?.closest?.(`.${PIN_CLASS}`)) return;

    closePinPopover();
  };

  const onKey = (e) => {
    if (!state.open) return;
    if (e.key === "Escape") closePinPopover();
  };

  window.addEventListener("mousedown", onDown, { capture: true });
  window.addEventListener("keydown", onKey, { capture: true });

  return () => {
    window.removeEventListener("mousedown", onDown, { capture: true });
    window.removeEventListener("keydown", onKey, { capture: true });
  };
}

let detachGlobals = null;

export async function openPinPopover({ highlightId, anchorEl }) {
  if (!highlightId || !anchorEl) return;
  ensureEl();

  const pageUrl = getPageUrl();
  state = { open: true, highlightId, anchorEl, pageUrl };

  // Load highlight to show current note
  const h = await fetchHighlight(pageUrl, highlightId);
  const ta = el.querySelector("textarea");
  const statusEl = el.querySelector(".status");

  ta.value = typeof h?.noteText === "string" ? h.noteText : "";
  statusEl.textContent = "";

  // (re)bind action buttons
  const btnOpenList = el.querySelector(".openlist");
  const btnUnpin = el.querySelector(".unpin");
  const btnDel = el.querySelector(".del");

  btnOpenList.onclick = () => {
    openPinsPanel({ focusId: highlightId });
    closePinPopover();
  };

  btnUnpin.onclick = async () => {
    try {
      statusEl.textContent = "Unpinning…";
      clearTimer(highlightId);

      const res = await patchHighlight({
        pageUrl,
        id: highlightId,
        patch: { pinned: false },
      });

      if (!res?.ok) {
        statusEl.textContent = "Unpin failed";
        return;
      }

      // fast UI
      removePinMarker(highlightId);
      closePinPopover();
    } catch {
      statusEl.textContent = "Unpin failed";
    }
  };

  btnDel.onclick = async () => {
    try {
      statusEl.textContent = "Deleting…";
      clearTimer(highlightId);

      const res = await deleteHighlight({ pageUrl, id: highlightId });
      if (!res?.ok) {
        statusEl.textContent = "Delete failed";
        return;
      }

      // fast UI (kernel sync will reconcile too)
      unwrapHighlightMarks(highlightId);
      removePinMarker(highlightId);
      closePinPopover();
    } catch {
      statusEl.textContent = "Delete failed";
    }
  };

  // debounce note save
  ta.oninput = () => {
    const txt = ta.value;

    clearTimer(highlightId);
    statusEl.textContent = "Saving…";

    const t = setTimeout(async () => {
      try {
        const res = await patchHighlight({
          pageUrl,
          id: highlightId,
          patch: { noteText: txt },
        });

        if (!res?.ok) {
          statusEl.textContent = "Save failed";
          return;
        }

        statusEl.textContent = "Saved";
        setTimeout(() => {
          if (state.open && state.highlightId === highlightId) statusEl.textContent = "";
        }, 650);
      } catch {
        statusEl.textContent = "Save failed";
      } finally {
        noteTimers.delete(highlightId);
      }
    }, 450);

    noteTimers.set(highlightId, t);
  };

  positionNearAnchor(anchorEl);

  // focus textarea
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });

  if (!detachGlobals) detachGlobals = attachGlobalCloseHandlers();
}

export function closePinPopover() {
  if (!el) return;
  state.open = false;
  state.highlightId = null;
  state.anchorEl = null;
  state.pageUrl = null;

  el.style.display = "none";

  if (detachGlobals) {
    detachGlobals();
    detachGlobals = null;
  }
}


export function isPinPopoverOpen() {
  return Boolean(state.open);
}

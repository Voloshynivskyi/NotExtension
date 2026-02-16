// File: core/content/ui/highlightToolbar.js
// Purpose: Provide a floating toolbar for highlight actions.
import {
  TOOLBAR_ID,
  TOOLBAR_STYLE_ID,
  UI_ATTR,
  Z_INDEX,
} from "../highlights/constants.js";

function ensureStyle() {
  if (document.getElementById(TOOLBAR_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = TOOLBAR_STYLE_ID;
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
      gap: 6px;
      align-items: center;
      max-width: min(520px, calc(100vw - 24px));
    }

    #${TOOLBAR_ID} .notext-btn {
      all: unset;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 8px;
      color: white;
      font: 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background: rgba(255,255,255,0.10);
      user-select: none;
      border: 1px solid transparent;
    }

    #${TOOLBAR_ID} .notext-btn:hover {
      background: rgba(255,255,255,0.18);
    }

    #${TOOLBAR_ID} .notext-btn.danger {
      background: rgba(239,68,68,0.18);
    }
    #${TOOLBAR_ID} .notext-btn.danger:hover {
      background: rgba(239,68,68,0.28);
    }

    #${TOOLBAR_ID} .notext-status {
      margin-left: 6px;
      font: 11px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: rgba(255,255,255,0.85);
      opacity: 0.95;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: none;
      max-width: 240px;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function ensureToolbar({ onHighlight, onPin, onRemove, onClick }) {
  let el = document.getElementById(TOOLBAR_ID);
  if (el) return el;

  ensureStyle();

  el = document.createElement("div");
  el.id = TOOLBAR_ID;
  el.setAttribute(UI_ATTR, "1");
  el.style.display = "none";

  // Backward-compatible:
  // - old usage: createHighlightToolbar({ onClick })
  // - new usage: createHighlightToolbar({ onHighlight, onPin, onRemove })
  const handleHighlight = typeof onHighlight === "function" ? onHighlight : onClick;

  const btnHl = document.createElement("button");
  btnHl.type = "button";
  btnHl.className = "notext-btn";
  btnHl.textContent = "Highlight";
  btnHl.setAttribute(UI_ATTR, "1");
  btnHl.dataset.role = "highlight";
  if (typeof handleHighlight === "function") {
    btnHl.addEventListener("click", handleHighlight);
  }

  el.appendChild(btnHl);

  if (typeof onPin === "function") {
    const btnPin = document.createElement("button");
    btnPin.type = "button";
    btnPin.className = "notext-btn";
    btnPin.textContent = "📌 Pin";
    btnPin.setAttribute(UI_ATTR, "1");
    btnPin.dataset.role = "pin";
    btnPin.addEventListener("click", onPin);
    el.appendChild(btnPin);
  }

  if (typeof onRemove === "function") {
    const btnRm = document.createElement("button");
    btnRm.type = "button";
    btnRm.className = "notext-btn danger";
    btnRm.textContent = "Remove";
    btnRm.setAttribute(UI_ATTR, "1");
    btnRm.dataset.role = "remove";
    btnRm.addEventListener("click", onRemove);
    el.appendChild(btnRm);
  }

  const status = document.createElement("span");
  status.className = "notext-status";
  status.setAttribute(UI_ATTR, "1");
  status.textContent = "";
  el.appendChild(status);

  (document.body || document.documentElement).appendChild(el);
  return el;
}

function getRectForRange(range) {
  const rects = range.getClientRects?.();
  if (rects && rects.length > 0) return rects[0];
  const r = range.getBoundingClientRect?.();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return r;
}

export function createHighlightToolbar({ onHighlight, onPin, onRemove, onClick }) {
  const el = ensureToolbar({ onHighlight, onPin, onRemove, onClick });
  const statusEl = el.querySelector(".notext-status");

  function showNearRange(range, pointer) {
    el.style.display = "flex";

    const pad = 8;
    const w = el.offsetWidth || 120;
    const h = el.offsetHeight || 32;

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

  function setStatus(text) {
    if (!statusEl) return;
    const t = String(text || "").trim();
    statusEl.textContent = t;
    statusEl.style.display = t ? "inline-block" : "none";
  }

  function clearStatus() {
    setStatus("");
  }

  return {
    showNearRange,
    hide() {
      el.style.display = "none";
      clearStatus();
    },
    isVisible() {
      return el.style.display !== "none";
    },
    isEventInsideUI(target) {
      return Boolean(target?.closest?.(`#${TOOLBAR_ID}`));
    },
    setStatus,
    clearStatus,
  };
}

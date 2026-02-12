// File: core/content/ui/highlightToolbar.js
// Purpose: Render and position the in-page highlight toolbar UI.
const TOOLBAR_ID = "notext-hl-toolbar";
const STYLE_ID = "notext-hl-style";
const UI_ATTR = "data-notextension-ui";

// Ensure the toolbar styles are injected once.
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TOOLBAR_ID}{
      position: fixed;
      z-index: 2147483647;
      display: none;
      padding: 6px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.12);
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(8px);
      box-shadow: 0 10px 24px rgba(0,0,0,0.16);
      user-select: none;
    }
    #${TOOLBAR_ID} button{
      height: 28px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.12);
      background: #fff;
      cursor: pointer;
      font: 600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }
    #${TOOLBAR_ID} button:hover{
      background: rgba(0,0,0,0.04);
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Create or reuse the toolbar element and wire the click handler.
function ensureToolbar(onClick) {
  let el = document.getElementById(TOOLBAR_ID);
  if (el) return el;

  ensureStyle();

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

// Prefer a visible client rect when the bounding box is empty.
function getRectForRange(range) {
  const rects = range.getClientRects?.();
  if (rects && rects.length > 0) return rects[0];
  return range.getBoundingClientRect();
}

// Public API for controlling the toolbar lifecycle.
export function createHighlightToolbar({ onClick }) {
  const el = ensureToolbar(onClick);

  return {
    // Show the toolbar near the given range.
    showNearRange(range) {
      const rect = getRectForRange(range);
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      el.style.display = "block";

      const tw = el.offsetWidth || 90;
      const th = el.offsetHeight || 40;

      // Center horizontally on the selection.
      let left = rect.left + rect.width / 2 - tw / 2;
      left = Math.max(8, Math.min(vw - tw - 8, left));

      // Prefer above the selection; fall back below if there is no room.
      let top = rect.top - th - 10;
      if (top < 8) top = rect.bottom + 10;
      top = Math.max(8, Math.min(vh - th - 8, top));

      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
    },

    // Hide the toolbar.
    hide() {
      el.style.display = "none";
    },

    // Check if an event target is inside the toolbar UI.
    isEventInsideUI(target) {
      return Boolean(target?.closest?.(`#${TOOLBAR_ID}`));
    },
  };
}

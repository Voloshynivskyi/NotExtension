// File: core/content/highlights/pins.js
// Purpose: Render pin markers next to highlights and handle pin interactions.
import { HIGHLIGHT_CLASS, UI_ATTR, PIN_CLASS, PIN_STYLE_ID } from "./constants.js";
import { openPinsPanel } from "../ui/pinsPanel.js";
import { openPinPopover } from "../ui/pinPopover.js";

function ensurePinStyle() {
  if (document.getElementById(PIN_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = PIN_STYLE_ID;

  style.textContent = `
    .${PIN_CLASS}{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;

      width: 20px;
      height: 20px;
      border-radius: 6px;

      border: 1px solid rgba(0,0,0,0.25);
      background-color: transparent;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 16px 16px;

      cursor: pointer;
      user-select: none;

      vertical-align: middle;
      opacity: 0.92;
      transform: translateY(-1px);

      transition:
        opacity 140ms ease,
        transform 140ms ease,
        border-color 140ms ease;

      padding: 0;
    }

    .${PIN_CLASS}:hover{
      opacity: 1;
      border-color: rgba(0,0,0,0.38);
      transform: translateY(-1px) scale(1.04);
    }

    .${PIN_CLASS}:active{
      transform: translateY(0px) scale(0.98);
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function pinExists(highlightId) {
  return Boolean(
    document.querySelector(`.${PIN_CLASS}[data-hid="${CSS.escape(highlightId)}"]`)
  );
}

function findLastMark(highlightId) {
  const nodes = document.querySelectorAll(
    `mark.${HIGHLIGHT_CLASS}[data-hid="${CSS.escape(highlightId)}"]`
  );
  if (!nodes || nodes.length === 0) return null;
  return nodes[nodes.length - 1];
}

function getPinIconUrl() {
  try {
    return chrome.runtime.getURL("icons/icon-32.png");
  } catch {
    return "";
  }
}

// Add logo-button marker after the last mark of a highlight.
export function renderPinMarker(highlightId) {
  if (!highlightId) return;
  ensurePinStyle();

  if (pinExists(highlightId)) return;

  const lastMark = findLastMark(highlightId);
  if (!lastMark) return;

  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = PIN_CLASS;

  pin.setAttribute("aria-label", "Open pin note");
  pin.setAttribute("title", "Open pin note (Shift+Click = open list)");
  pin.setAttribute("data-hid", highlightId);

  // Mark as UI so anchor building ignores it.
  pin.setAttribute(UI_ATTR, "1");

  const url = getPinIconUrl();
  if (url) {
    pin.style.backgroundImage = `url("${url}")`;
  } else {
    pin.textContent = "●";
    pin.style.fontSize = "14px";
    pin.style.color = "#111827";
  }

  const parent = lastMark.parentNode;
  if (!parent) return;
  parent.insertBefore(pin, lastMark.nextSibling);

  pin.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Shift+Click -> open full panel with focus
    if (e.shiftKey) {
      openPinsPanel({ focusId: highlightId });
      return;
    }

    // Normal click -> popover editor near pin
    await openPinPopover({ highlightId, anchorEl: pin });
  });
}

export function removePinMarker(highlightId) {
  if (!highlightId) return;
  const pin = document.querySelector(`.${PIN_CLASS}[data-hid="${CSS.escape(highlightId)}"]`);
  pin?.remove?.();
}

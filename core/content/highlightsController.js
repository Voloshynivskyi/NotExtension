// File: core/content/highlightsController.js
// Purpose: Manage selection-driven highlight creation via the toolbar.
import { createHighlightToolbar } from "./ui/highlightToolbar.js";
import { applyHighlight } from "./dom/applyHighlight.js";

const UI_ATTR = "data-notextension-ui";

// Check whether a node is inside an editable element.
function isEditableNode(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el) return false;
  return Boolean(el.closest("input, textarea, [contenteditable='true']"));
}

// Check whether a node is part of the extension UI.
function isInsideOurUI(node) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  if (!el) return false;
  return Boolean(el.closest(`[${UI_ATTR}]`));
}

// Return a valid user selection range or null if the selection is not usable.
function getValidSelectionRange() {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  if (sel.isCollapsed) return null;

  const text = sel.toString();
  if (!text || text.trim().length === 0) return null;

  const range = sel.getRangeAt(0);

  // Do not operate inside editable fields.
  if (isEditableNode(sel.anchorNode) || isEditableNode(sel.focusNode)) return null;

  // Ignore selections inside the extension UI.
  if (isInsideOurUI(range.commonAncestorContainer)) return null;

  return range;
}

// Wire selection listeners and show the toolbar near a valid selection.
export function initHighlightsController() {
  let lastRange = null;

  const toolbar = createHighlightToolbar({
    onClick: () => {
      if (!lastRange) return;

      // Clone the range because applyHighlight mutates the DOM.
      const r = lastRange.cloneRange();
      const res = applyHighlight(r);

      // Clear selection so the toolbar does not immediately reappear.
      try {
        const sel = window.getSelection?.();
        sel?.removeAllRanges?.();
      } catch { }

      toolbar.hide();
      lastRange = null;

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn("[highlights] apply failed:", res.error);
      }
    },
  });

  let raf = 0;
  // Debounce selection updates to the next animation frame.
  function scheduleUpdate() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      const range = getValidSelectionRange();
      if (!range) {
        toolbar.hide();
        lastRange = null;
        return;
      }
      lastRange = range;
      toolbar.showNearRange(range);
    });
  }

  document.addEventListener("selectionchange", scheduleUpdate, true);
  document.addEventListener("mouseup", scheduleUpdate, true);
  document.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "Escape") {
        toolbar.hide();
        lastRange = null;
      } else {
        scheduleUpdate();
      }
    },
    true
  );

  // Hide the toolbar on scroll to avoid floating in the wrong place.
  window.addEventListener("scroll", () => toolbar.hide(), true);
  window.addEventListener("resize", scheduleUpdate, true);
}

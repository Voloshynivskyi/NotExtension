// File: core/shared/protocol.js
// Purpose: Define message and event type constants for extension messaging.

export const MessageTypes = Object.freeze({
  // Notes
  NOTE_SET: "NOTE_SET",
  NOTE_GET: "NOTE_GET",
  NOTE_DELETE: "NOTE_DELETE",

  // Badge
  BADGE_STATUS_GET: "BADGE_STATUS_GET",

  // Settings
  SETTINGS_GET: "SETTINGS_GET",
  SETTINGS_PATCH: "SETTINGS_PATCH",

  // Highlights (storage / background)
  HIGHLIGHTS_LIST: "HIGHLIGHTS_LIST",
  HIGHLIGHT_CREATE: "HIGHLIGHT_CREATE",
  HIGHLIGHT_DELETE: "HIGHLIGHT_DELETE",
  HIGHLIGHTS_CLEAR_PAGE: "HIGHLIGHTS_CLEAR_PAGE",

  // Highlights -> new capabilities (pinned highlight / note)
  HIGHLIGHT_PATCH: "HIGHLIGHT_PATCH",

  // Content-only: request current selection anchor (for context menu / other triggers)
  HIGHLIGHT_CAPTURE_SELECTION: "HIGHLIGHT_CAPTURE_SELECTION",
});

export const ContentEventTypes = Object.freeze({
  // Badge events -> content
  BADGE_SET: "BADGE_SET",
  BADGE_ENABLED_SET: "BADGE_ENABLED_SET",

  // Highlights events -> content (for rerender/restore/panel refresh)
  HIGHLIGHTS_UPDATED: "HIGHLIGHTS_UPDATED",
});

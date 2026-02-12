// File: core/background/handlers/highlights.js
// Purpose: Persist and manage highlight records in extension storage.
import { MessageTypes } from "../../shared/protocol.js";
import { storageGet, storageSet } from "../../shared/storage.js";

const KEY = "highlights";

const DEFAULT = Object.freeze({
  _v: 1,
  byPage: {}, // { [pageKey]: Highlight[] }
});

// Check for a plain object value.
function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

// Normalize a page URL by stripping the hash fragment.
function normalizePageUrl(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) return "";
  try {
    const u = new URL(raw);
    u.hash = ""; // Drop the hash to avoid per-section keys.
    return u.toString();
  } catch {
    // Fallback for invalid URLs.
    return raw.split("#")[0];
  }
}

// Normalize storage shape to a known schema.
function normalizeStore(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const byPage = isPlainObject(s.byPage) ? s.byPage : {};
  return { _v: 1, byPage };
}

// Create a new highlight id.
function makeId() {
  return `hl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// Restrict highlight color to known values.
function normalizeColor(c) {
  const v = typeof c === "string" ? c : "yellow";
  return ["yellow", "green", "blue", "pink"].includes(v) ? v : "yellow";
}

// Build handlers for highlight message types.
export function createHighlightsHandlers() {
  return {
    async [MessageTypes.HIGHLIGHTS_LIST](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      if (!pageUrl) return { ok: false, error: "pageUrl is required" };

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const list = Array.isArray(store.byPage[pageUrl]) ? store.byPage[pageUrl] : [];
      return { ok: true, highlights: list };
    },

    async [MessageTypes.HIGHLIGHT_CREATE](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      if (!pageUrl) return { ok: false, error: "pageUrl is required" };

      const color = normalizeColor(payload?.color);

      // Anchor describes how the highlight should be restored.
      const anchor = isPlainObject(payload?.anchor) ? payload.anchor : null;
      if (!anchor) return { ok: false, error: "anchor is required" };

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const created = {
        id: makeId(),
        pageUrl,
        color,
        anchor,
        createdAt: Date.now(),
      };

      const prev = Array.isArray(store.byPage[pageUrl]) ? store.byPage[pageUrl] : [];
      const next = { ...store, byPage: { ...store.byPage, [pageUrl]: [created, ...prev] } };

      await storageSet({ [KEY]: next });
      return { ok: true, highlight: created };
    },

    async [MessageTypes.HIGHLIGHT_DELETE](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      const id = typeof payload?.id === "string" ? payload.id : "";

      if (!pageUrl) return { ok: false, error: "pageUrl is required" };
      if (!id) return { ok: false, error: "id is required" };

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const prev = Array.isArray(store.byPage[pageUrl]) ? store.byPage[pageUrl] : [];
      const filtered = prev.filter((h) => h?.id !== id);

      const next = { ...store, byPage: { ...store.byPage, [pageUrl]: filtered } };
      await storageSet({ [KEY]: next });

      return { ok: true };
    },

    async [MessageTypes.HIGHLIGHTS_CLEAR_PAGE](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      if (!pageUrl) return { ok: false, error: "pageUrl is required" };

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const byPage = { ...store.byPage };
      delete byPage[pageUrl];

      const next = { ...store, byPage };
      await storageSet({ [KEY]: next });

      return { ok: true };
    },
  };
}

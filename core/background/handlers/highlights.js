// File: core/background/handlers/highlights.js
// Purpose: Store and manage text highlights (and pinned highlights with notes).
//
// MVP invariants we enforce here:
// 1) We do not allow multiple highlights that represent the same anchored text (duplicate anchors).
// 2) Pin is a status on highlight: pinned + noteText live on the highlight object.
// 3) We keep storage clean by deduplicating on LIST and CREATE.

import { ContentEventTypes, MessageTypes } from "../../shared/protocol.js";
import { storageGet, storageSet } from "../../shared/storage.js";

const KEY = "highlights";

const DEFAULT = Object.freeze({
  _v: 1,
  byPage: {}, // { [pageUrl]: Highlight[] }
});

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function normalizePageUrl(raw) {
  if (typeof raw !== "string" || raw.trim().length === 0) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    return u.toString();
  } catch {
    return raw.split("#")[0];
  }
}

function makeId() {
  return `hl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeColor(c) {
  const v = typeof c === "string" ? c : "yellow";
  return ["yellow", "green", "blue", "pink"].includes(v) ? v : "yellow";
}

function normalizeBool(v, fallback = false) {
  return typeof v === "boolean" ? v : fallback;
}

function normalizeNoteText(v) {
  if (typeof v !== "string") return "";
  if (v.length > 10_000) return v.slice(0, 10_000);
  return v;
}

function normalizeAnchor(a) {
  const obj = isPlainObject(a) ? a : null;
  if (!obj) return null;

  const dom = isPlainObject(obj.dom) ? obj.dom : null;
  const quote = isPlainObject(obj.quote) ? obj.quote : null;

  const start = dom && isPlainObject(dom.start) ? dom.start : null;
  const end = dom && isPlainObject(dom.end) ? dom.end : null;

  const anchor = {
    dom: {
      start: {
        xpath: typeof start?.xpath === "string" ? start.xpath : "",
        offset: typeof start?.offset === "number" ? start.offset : 0,
      },
      end: {
        xpath: typeof end?.xpath === "string" ? end.xpath : "",
        offset: typeof end?.offset === "number" ? end.offset : 0,
      },
    },
    quote: {
      exact: typeof quote?.exact === "string" ? quote.exact : "",
      prefix: typeof quote?.prefix === "string" ? quote.prefix : "",
      suffix: typeof quote?.suffix === "string" ? quote.suffix : "",
    },
  };

  if (!anchor.quote.exact || anchor.quote.exact.trim().length === 0) return null;
  return anchor;
}

function normalizeHighlight(h, pageUrlFallback = "") {
  const obj = isPlainObject(h) ? h : {};
  const pageUrl = normalizePageUrl(obj.pageUrl) || pageUrlFallback;

  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : makeId(),
    pageUrl,
    color: normalizeColor(obj.color),
    anchor: normalizeAnchor(obj.anchor),
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
    pinned: normalizeBool(obj.pinned, false),
    noteText: normalizeNoteText(obj.noteText),
  };
}

function normalizeStore(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const byPageRaw = isPlainObject(s.byPage) ? s.byPage : {};
  const byPage = {};

  for (const [pageUrlRaw, listRaw] of Object.entries(byPageRaw)) {
    const pageUrl = normalizePageUrl(pageUrlRaw);
    if (!pageUrl) continue;

    const list = Array.isArray(listRaw) ? listRaw : [];
    byPage[pageUrl] = list
      .map((h) => normalizeHighlight(h, pageUrl))
      .filter((h) => h.anchor && typeof h.anchor === "object");
  }

  return { _v: 1, byPage };
}

function findIndexById(list, id) {
  return list.findIndex((h) => h?.id === id);
}

// ---- DEDUPE ----
function stripMarkSegments(xpath) {
  if (typeof xpath !== "string") return "";
  return xpath.replace(/\/mark\[\d+\]/g, "");
}

function anchorKey(anchor) {
  const a = normalizeAnchor(anchor);
  if (!a) return "";

  const sx = stripMarkSegments(a.dom.start.xpath);
  const ex = stripMarkSegments(a.dom.end.xpath);

  return [
    sx,
    a.dom.start.offset,
    ex,
    a.dom.end.offset,
    a.quote.exact.trim(),
  ].join("|");
}

function mergeIntoSurvivor(survivor, other) {
  const pinned = Boolean(survivor.pinned) || Boolean(other.pinned);

  const noteText =
    (survivor.noteText && survivor.noteText.trim().length > 0)
      ? survivor.noteText
      : other.noteText;

  const color = survivor.color || other.color || "yellow";

  return {
    ...survivor,
    pinned,
    noteText: normalizeNoteText(noteText),
    color: normalizeColor(color),
  };
}

function dedupePageList(list) {
  const seen = new Map(); // key -> index in out
  const out = [];

  let changed = false;

  for (const raw of list) {
    const h = normalizeHighlight(raw, raw?.pageUrl || "");
    const key = anchorKey(h.anchor);

    if (!key) {
      out.push(h);
      continue;
    }

    if (!seen.has(key)) {
      seen.set(key, out.length);
      out.push(h);
      continue;
    }

    const idx = seen.get(key);
    const survivor = out[idx];

    if ((h.createdAt || 0) > (survivor.createdAt || 0)) {
      out[idx] = mergeIntoSurvivor(h, survivor);
    } else {
      out[idx] = mergeIntoSurvivor(survivor, h);
    }

    changed = true;
  }

  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { list: out, changed };
}

// ---- TAB BROADCAST ----
async function getAllTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(tabs || []);
    });
  });
}

async function sendMessageToTabBestEffort(tabId, message) {
  return new Promise((resolve) => {
    if (typeof tabId !== "number") return resolve({ ok: false, error: "Invalid tabId" });
    chrome.tabs.sendMessage(tabId, message, () => {
      const err = chrome.runtime.lastError;
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true });
    });
  });
}

async function broadcastHighlightsUpdated(pageUrl) {
  if (!pageUrl) return { attempted: 0, delivered: 0 };

  const tabs = await getAllTabs();
  const targets = tabs.filter((tab) => tab?.url && normalizePageUrl(tab.url) === pageUrl);

  let delivered = 0;
  for (const tab of targets) {
    if (tab.id == null) continue;
    const res = await sendMessageToTabBestEffort(tab.id, {
      type: ContentEventTypes.HIGHLIGHTS_UPDATED,
      payload: { pageUrl },
    });
    if (res.ok) delivered += 1;
  }

  return { attempted: targets.length, delivered };
}

export function createHighlightsHandlers() {
  return {
    async [MessageTypes.HIGHLIGHTS_LIST](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      if (!pageUrl) return { ok: false, error: "pageUrl is required" };

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const prev = Array.isArray(store.byPage[pageUrl]) ? store.byPage[pageUrl] : [];
      const { list, changed } = dedupePageList(prev);

      if (changed) {
        const nextStore = { ...store, byPage: { ...store.byPage, [pageUrl]: list } };
        await storageSet({ [KEY]: nextStore });
        await broadcastHighlightsUpdated(pageUrl);
      }

      return { ok: true, highlights: list };
    },

    async [MessageTypes.HIGHLIGHT_CREATE](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      if (!pageUrl) return { ok: false, error: "pageUrl is required" };

      const color = normalizeColor(payload?.color);
      const anchor = normalizeAnchor(payload?.anchor);
      if (!anchor) return { ok: false, error: "anchor is required" };

      const pinned = normalizeBool(payload?.pinned, false);
      const noteText = normalizeNoteText(payload?.noteText);

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const prev = Array.isArray(store.byPage[pageUrl]) ? store.byPage[pageUrl] : [];

      const key = anchorKey(anchor);
      if (key) {
        const existingIdx = prev.findIndex((h) => anchorKey(h?.anchor) === key);
        if (existingIdx !== -1) {
          const existing = normalizeHighlight(prev[existingIdx], pageUrl);

          const merged = mergeIntoSurvivor(existing, {
            pinned,
            noteText,
            color,
            createdAt: Date.now(),
          });

          const nextList = prev.slice();
          nextList[existingIdx] = merged;

          const { list: deduped, changed } = dedupePageList(nextList);

          const nextStore = { ...store, byPage: { ...store.byPage, [pageUrl]: deduped } };
          await storageSet({ [KEY]: nextStore });

          if (changed || merged.pinned !== existing.pinned || merged.noteText !== existing.noteText) {
            await broadcastHighlightsUpdated(pageUrl);
          }

          return { ok: true, highlight: merged, deduped: true };
        }
      }

      const created = normalizeHighlight(
        {
          id: makeId(),
          pageUrl,
          color,
          anchor,
          createdAt: Date.now(),
          pinned,
          noteText,
        },
        pageUrl
      );

      const nextList = [created, ...prev];
      const { list: deduped, changed } = dedupePageList(nextList);

      const next = { ...store, byPage: { ...store.byPage, [pageUrl]: deduped } };
      await storageSet({ [KEY]: next });
      await broadcastHighlightsUpdated(pageUrl);
      return { ok: true, highlight: created, deduped: changed };
    },

    async [MessageTypes.HIGHLIGHT_PATCH](payload) {
      const pageUrl = normalizePageUrl(payload?.pageUrl);
      const id = typeof payload?.id === "string" ? payload.id : "";
      const patch = isPlainObject(payload?.patch) ? payload.patch : {};

      if (!pageUrl) return { ok: false, error: "pageUrl is required" };
      if (!id) return { ok: false, error: "id is required" };

      const res = await storageGet([KEY]);
      const store = normalizeStore(res?.[KEY] || DEFAULT);

      const prev = Array.isArray(store.byPage[pageUrl]) ? store.byPage[pageUrl] : [];
      const idx = findIndexById(prev, id);
      if (idx === -1) return { ok: false, error: "highlight not found" };

      const current = normalizeHighlight(prev[idx], pageUrl);

      const nextItem = normalizeHighlight(
        {
          ...current,
          pinned: patch.pinned != null ? normalizeBool(patch.pinned, current.pinned) : current.pinned,
          noteText: patch.noteText != null ? normalizeNoteText(patch.noteText) : current.noteText,
          color: patch.color != null ? normalizeColor(patch.color) : current.color,
        },
        pageUrl
      );

      const nextList = prev.slice();
      nextList[idx] = nextItem;

      const { list: deduped, changed } = dedupePageList(nextList);

      const nextStore = { ...store, byPage: { ...store.byPage, [pageUrl]: deduped } };
      await storageSet({ [KEY]: nextStore });
      await broadcastHighlightsUpdated(pageUrl);

      const ret = deduped.find((h) => h.id === nextItem.id) || nextItem;
      return { ok: true, highlight: ret, deduped: changed };
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

      await broadcastHighlightsUpdated(pageUrl);
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

      await broadcastHighlightsUpdated(pageUrl);
      return { ok: true };
    },
  };
}

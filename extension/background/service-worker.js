(() => {
  // core/background/router.js
  function createRouter(handlersByType) {
    return async function route(message) {
      const { type, payload } = message ?? {};
      const handler = handlersByType[type];
      if (!handler) {
        return { ok: false, error: `Unknown message type: ${String(type)}` };
      }
      try {
        return await handler(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return { ok: false, error: msg };
      }
    };
  }

  // core/shared/protocol.js
  var MessageTypes = Object.freeze({
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
    HIGHLIGHT_CAPTURE_SELECTION: "HIGHLIGHT_CAPTURE_SELECTION"
  });
  var ContentEventTypes = Object.freeze({
    // Badge events -> content
    BADGE_SET: "BADGE_SET",
    BADGE_ENABLED_SET: "BADGE_ENABLED_SET",
    // Highlights events -> content (for rerender/restore/panel refresh)
    HIGHLIGHTS_UPDATED: "HIGHLIGHTS_UPDATED"
  });

  // core/shared/storage.js
  function lastErrorToError() {
    const err = chrome.runtime.lastError;
    return err ? new Error(err.message) : null;
  }
  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        const e = lastErrorToError();
        if (e) reject(e);
        else resolve(result || {});
      });
    });
  }
  function storageSet(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        const e = lastErrorToError();
        if (e) reject(e);
        else resolve();
      });
    });
  }
  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        const e = lastErrorToError();
        if (e) reject(e);
        else resolve();
      });
    });
  }

  // core/background/handlers/notes.js
  function validateOrigin(origin) {
    return typeof origin === "string" && origin.trim().length > 0;
  }
  function validateText(text) {
    return typeof text === "string" && text.length <= 1e4;
  }
  function createNotesHandlers({ broadcast } = {}) {
    return {
      async [MessageTypes.NOTE_SET](payload) {
        const { tabId, origin, text } = payload ?? {};
        if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };
        if (!validateText(text)) return { ok: false, error: "Invalid text (max 10k chars)" };
        const trimmed = text.trim();
        if (trimmed.length === 0) {
          await storageRemove([origin]);
          await broadcast?.badgeSetByOrigin?.(origin, false, tabId);
          return { ok: true };
        }
        await storageSet({ [origin]: text });
        await broadcast?.badgeSetByOrigin?.(origin, true, tabId);
        return { ok: true };
      },
      async [MessageTypes.NOTE_GET](payload) {
        const { origin } = payload ?? {};
        if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };
        const result = await storageGet([origin]);
        const note = typeof result[origin] === "string" ? result[origin] : "";
        return { ok: true, note };
      },
      async [MessageTypes.NOTE_DELETE](payload) {
        const { tabId, origin } = payload ?? {};
        if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };
        await storageRemove([origin]);
        await broadcast?.badgeSetByOrigin?.(origin, false, tabId);
        return { ok: true };
      }
    };
  }

  // core/shared/url.js
  function getOriginFromUrl(url) {
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  }
  function tabOrigin(tabUrl) {
    return getOriginFromUrl(tabUrl);
  }

  // core/background/handlers/badge.js
  function createBadgeHandlers() {
    return {
      async [MessageTypes.BADGE_STATUS_GET](payload) {
        const { origin } = payload ?? {};
        if (typeof origin !== "string" || origin.trim() === "") {
          return { ok: false, error: "Invalid origin" };
        }
        const result = await storageGet([origin]);
        const note = typeof result[origin] === "string" ? result[origin] : "";
        const hasNote = note.trim().length > 0;
        return { ok: true, hasNote };
      }
    };
  }

  // core/shared/settingsSchema.js
  var SETTINGS_KEY = "settings";
  var DEFAULT_SETTINGS = Object.freeze({
    _v: 1,
    autosaveEnabled: true,
    theme: "light",
    // "light" | "dark"
    modules: {
      badge: true,
      highlights: true,
      pins: true
    },
    badge: {
      globalEnabled: true,
      disabledOrigins: []
    }
  });
  function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }
  function deepMerge(base, patch) {
    const out = { ...base || {} };
    for (const [k, v] of Object.entries(patch || {})) {
      if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
      else out[k] = v;
    }
    return out;
  }
  function normalizeTheme(v) {
    return v === "dark" ? "dark" : "light";
  }
  function normalizeBool(v, fallback) {
    return typeof v === "boolean" ? v : fallback;
  }
  function uniqStrings(arr) {
    const raw = Array.isArray(arr) ? arr : [];
    const trimmed = raw.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
    return Array.from(new Set(trimmed));
  }
  function normalizeModules(raw) {
    const m = isPlainObject(raw) ? raw : {};
    const d = DEFAULT_SETTINGS.modules;
    const out = {
      badge: normalizeBool(m.badge, d.badge),
      highlights: normalizeBool(m.highlights, d.highlights),
      pins: normalizeBool(m.pins, d.pins)
    };
    if (out.highlights === false) out.pins = false;
    return out;
  }
  function normalizeBadge(raw) {
    const b = isPlainObject(raw) ? raw : {};
    return {
      globalEnabled: normalizeBool(b.globalEnabled, true),
      disabledOrigins: uniqStrings(b.disabledOrigins)
    };
  }
  function normalizeSettings(raw) {
    const s = isPlainObject(raw) ? raw : {};
    return {
      _v: 1,
      autosaveEnabled: normalizeBool(s.autosaveEnabled, true),
      theme: normalizeTheme(s.theme),
      modules: normalizeModules(s.modules),
      badge: normalizeBadge(s.badge)
    };
  }
  function applySettingsPatch(current, patch) {
    const merged = deepMerge(current, patch);
    return normalizeSettings(merged);
  }

  // core/background/handlers/settings.js
  function isPlainObject2(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }
  function createSettingsHandlers() {
    return {
      async [MessageTypes.SETTINGS_GET]() {
        const res = await storageGet([SETTINGS_KEY]);
        const stored = res?.[SETTINGS_KEY];
        const settings = normalizeSettings(stored || DEFAULT_SETTINGS);
        if (!stored) await storageSet({ [SETTINGS_KEY]: settings });
        return { ok: true, settings };
      },
      async [MessageTypes.SETTINGS_PATCH](payload) {
        const patch = isPlainObject2(payload?.patch) ? payload.patch : {};
        const res = await storageGet([SETTINGS_KEY]);
        const current = normalizeSettings(res?.[SETTINGS_KEY] || DEFAULT_SETTINGS);
        const next = applySettingsPatch(current, patch);
        await storageSet({ [SETTINGS_KEY]: next });
        return { ok: true, settings: next };
      }
    };
  }

  // core/background/handlers/highlights.js
  var KEY = "highlights";
  var DEFAULT = Object.freeze({
    _v: 1,
    byPage: {}
    // { [pageUrl]: Highlight[] }
  });
  function isPlainObject3(v) {
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
  function normalizeBool2(v, fallback = false) {
    return typeof v === "boolean" ? v : fallback;
  }
  function normalizeNoteText(v) {
    if (typeof v !== "string") return "";
    if (v.length > 1e4) return v.slice(0, 1e4);
    return v;
  }
  function normalizeAnchor(a) {
    const obj = isPlainObject3(a) ? a : null;
    if (!obj) return null;
    const dom = isPlainObject3(obj.dom) ? obj.dom : null;
    const quote = isPlainObject3(obj.quote) ? obj.quote : null;
    const start = dom && isPlainObject3(dom.start) ? dom.start : null;
    const end = dom && isPlainObject3(dom.end) ? dom.end : null;
    const anchor = {
      dom: {
        start: {
          xpath: typeof start?.xpath === "string" ? start.xpath : "",
          offset: typeof start?.offset === "number" ? start.offset : 0
        },
        end: {
          xpath: typeof end?.xpath === "string" ? end.xpath : "",
          offset: typeof end?.offset === "number" ? end.offset : 0
        }
      },
      quote: {
        exact: typeof quote?.exact === "string" ? quote.exact : "",
        prefix: typeof quote?.prefix === "string" ? quote.prefix : "",
        suffix: typeof quote?.suffix === "string" ? quote.suffix : ""
      }
    };
    if (!anchor.quote.exact || anchor.quote.exact.trim().length === 0) return null;
    return anchor;
  }
  function normalizeHighlight(h, pageUrlFallback = "") {
    const obj = isPlainObject3(h) ? h : {};
    const pageUrl = normalizePageUrl(obj.pageUrl) || pageUrlFallback;
    return {
      id: typeof obj.id === "string" && obj.id ? obj.id : makeId(),
      pageUrl,
      color: normalizeColor(obj.color),
      anchor: normalizeAnchor(obj.anchor),
      createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
      pinned: normalizeBool2(obj.pinned, false),
      noteText: normalizeNoteText(obj.noteText)
    };
  }
  function normalizeStore(raw) {
    const s = isPlainObject3(raw) ? raw : {};
    const byPageRaw = isPlainObject3(s.byPage) ? s.byPage : {};
    const byPage = {};
    for (const [pageUrlRaw, listRaw] of Object.entries(byPageRaw)) {
      const pageUrl = normalizePageUrl(pageUrlRaw);
      if (!pageUrl) continue;
      const list = Array.isArray(listRaw) ? listRaw : [];
      byPage[pageUrl] = list.map((h) => normalizeHighlight(h, pageUrl)).filter((h) => h.anchor && typeof h.anchor === "object");
    }
    return { _v: 1, byPage };
  }
  function findIndexById(list, id) {
    return list.findIndex((h) => h?.id === id);
  }
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
      a.quote.exact.trim()
    ].join("|");
  }
  function mergeIntoSurvivor(survivor, other) {
    const pinned = Boolean(survivor.pinned) || Boolean(other.pinned);
    const noteText = survivor.noteText && survivor.noteText.trim().length > 0 ? survivor.noteText : other.noteText;
    const color = survivor.color || other.color || "yellow";
    return {
      ...survivor,
      pinned,
      noteText: normalizeNoteText(noteText),
      color: normalizeColor(color)
    };
  }
  function dedupePageList(list) {
    const seen = /* @__PURE__ */ new Map();
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
        payload: { pageUrl }
      });
      if (res.ok) delivered += 1;
    }
    return { attempted: targets.length, delivered };
  }
  function createHighlightsHandlers() {
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
        const pinned = normalizeBool2(payload?.pinned, false);
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
              createdAt: Date.now()
            });
            const nextList2 = prev.slice();
            nextList2[existingIdx] = merged;
            const { list: deduped2, changed: changed2 } = dedupePageList(nextList2);
            const nextStore = { ...store, byPage: { ...store.byPage, [pageUrl]: deduped2 } };
            await storageSet({ [KEY]: nextStore });
            if (changed2 || merged.pinned !== existing.pinned || merged.noteText !== existing.noteText) {
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
            noteText
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
        const patch = isPlainObject3(payload?.patch) ? payload.patch : {};
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
            pinned: patch.pinned != null ? normalizeBool2(patch.pinned, current.pinned) : current.pinned,
            noteText: patch.noteText != null ? normalizeNoteText(patch.noteText) : current.noteText,
            color: patch.color != null ? normalizeColor(patch.color) : current.color
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
      }
    };
  }

  // core/kernel/featureRegistry.js
  function getFeatures() {
    return [
      {
        key: "settings",
        createBackgroundHandlers() {
          return createSettingsHandlers();
        }
      },
      {
        key: "notes",
        createBackgroundHandlers({ broadcast }) {
          return createNotesHandlers({ broadcast });
        }
      },
      {
        key: "badge",
        createBackgroundHandlers() {
          return createBadgeHandlers();
        }
      },
      {
        key: "highlights",
        createBackgroundHandlers({ broadcast }) {
          return createHighlightsHandlers({ broadcast });
        }
      }
    ];
  }

  // core/kernel/backgroundKernel.js
  function normalizePageUrl2(raw) {
    if (typeof raw !== "string" || raw.trim().length === 0) return "";
    try {
      const u = new URL(raw);
      u.hash = "";
      return u.toString();
    } catch {
      return raw.split("#")[0];
    }
  }
  async function getAllTabs2() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(tabs || []);
      });
    });
  }
  async function sendToTabBestEffort(tabId, message) {
    return new Promise((resolve) => {
      if (typeof tabId !== "number") return resolve({ ok: false, error: "Invalid tabId" });
      chrome.tabs.sendMessage(tabId, message, () => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true });
      });
    });
  }
  function createBroadcast() {
    return {
      async badgeSetByOrigin(origin, hasNote, fallbackTabId) {
        const o = typeof origin === "string" ? origin.trim() : "";
        if (!o) return { attempted: 0, delivered: 0 };
        const tabs = await getAllTabs2();
        const targets = tabs.filter((tab) => tab?.url && tabOrigin(tab.url) === o);
        let delivered = 0;
        for (const tab of targets) {
          if (tab.id == null) continue;
          const res = await sendToTabBestEffort(tab.id, {
            type: ContentEventTypes.BADGE_SET,
            payload: { hasNote: Boolean(hasNote) }
          });
          if (res.ok) delivered += 1;
        }
        if (delivered === 0 && typeof fallbackTabId === "number") {
          await sendToTabBestEffort(fallbackTabId, {
            type: ContentEventTypes.BADGE_SET,
            payload: { hasNote: Boolean(hasNote) }
          });
        }
        return { attempted: targets.length, delivered };
      },
      async highlightsUpdated(pageUrl) {
        const p = normalizePageUrl2(pageUrl);
        if (!p) return { attempted: 0, delivered: 0 };
        const tabs = await getAllTabs2();
        const targets = tabs.filter((tab) => tab?.url && normalizePageUrl2(tab.url) === p);
        let delivered = 0;
        for (const tab of targets) {
          if (tab.id == null) continue;
          const res = await sendToTabBestEffort(tab.id, {
            type: ContentEventTypes.HIGHLIGHTS_UPDATED,
            payload: { pageUrl: p }
          });
          if (res.ok) delivered += 1;
        }
        return { attempted: targets.length, delivered };
      }
    };
  }
  function initBackgroundKernel() {
    const broadcast = createBroadcast();
    const handlers = {};
    for (const feature of getFeatures()) {
      const h = feature.createBackgroundHandlers?.({ broadcast }) ?? {};
      Object.assign(handlers, h);
    }
    const route = createRouter(handlers);
    console.log("Background Service Worker started \u{1F680}");
    chrome.runtime.onInstalled.addListener(() => {
      console.log("Extension installed/updated");
    });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      (async () => {
        const result = await route(message);
        sendResponse(result);
      })();
      return true;
    });
  }

  // core/background/index.js
  initBackgroundKernel();
})();

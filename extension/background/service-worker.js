(() => {
  // core/background/router.js
  function createRouter(handlersByType) {
    return async function route2(message) {
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
    HIGHLIGHTS_CLEAR_PAGE: "HIGHLIGHTS_CLEAR_PAGE"
  });
  var ContentEventTypes = Object.freeze({
    // Badge events -> content
    BADGE_SET: "BADGE_SET",
    BADGE_ENABLED_SET: "BADGE_ENABLED_SET"
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
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, error: err.message });
        else resolve({ ok: true, response });
      });
    });
  }
  async function broadcastBadgeByOrigin(origin, hasNote, fallbackTabId) {
    const tabs = await getAllTabs();
    const targets = tabs.filter((tab) => tab?.url && tabOrigin(tab.url) === origin);
    let delivered = 0;
    for (const tab of targets) {
      if (tab.id == null) continue;
      const res = await sendMessageToTabBestEffort(tab.id, {
        type: ContentEventTypes.BADGE_SET,
        payload: { hasNote }
      });
      if (res.ok) delivered += 1;
    }
    if (delivered === 0 && typeof fallbackTabId === "number") {
      await sendMessageToTabBestEffort(fallbackTabId, {
        type: ContentEventTypes.BADGE_SET,
        payload: { hasNote }
      });
    }
    return { attempted: targets.length, delivered };
  }
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

  // core/background/handlers/notes.js
  function validateOrigin(origin) {
    return typeof origin === "string" && origin.trim().length > 0;
  }
  function validateText(text) {
    return typeof text === "string" && text.length <= 1e4;
  }
  function createNotesHandlers() {
    return {
      async [MessageTypes.NOTE_SET](payload) {
        const { tabId, origin, text } = payload ?? {};
        if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };
        if (!validateText(text)) return { ok: false, error: "Invalid text (max 10k chars)" };
        await storageSet({ [origin]: text });
        const hasNote = text.trim().length > 0;
        await broadcastBadgeByOrigin(origin, hasNote, tabId);
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
        await broadcastBadgeByOrigin(origin, false, tabId);
        return { ok: true };
      }
    };
  }

  // core/background/handlers/settings.js
  var SETTINGS_KEY = "settings";
  var DEFAULT_SETTINGS = Object.freeze({
    _v: 1,
    autosaveEnabled: true,
    theme: "light",
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
  function normalizeBadge(badgeRaw) {
    const b = badgeRaw && typeof badgeRaw === "object" ? badgeRaw : {};
    const globalEnabled = typeof b.globalEnabled === "boolean" ? b.globalEnabled : true;
    const arr = Array.isArray(b.disabledOrigins) ? b.disabledOrigins : [];
    const disabledOrigins = Array.from(
      new Set(arr.filter((x) => typeof x === "string" && x.trim().length > 0))
    );
    return { globalEnabled, disabledOrigins };
  }
  function normalizeSettings(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    return {
      _v: 1,
      autosaveEnabled: normalizeBool(s.autosaveEnabled, true),
      theme: normalizeTheme(s.theme),
      badge: normalizeBadge(s.badge)
    };
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
        const patch = isPlainObject(payload?.patch) ? payload.patch : {};
        const res = await storageGet([SETTINGS_KEY]);
        const current = normalizeSettings(res?.[SETTINGS_KEY] || DEFAULT_SETTINGS);
        const merged = deepMerge(current, patch);
        const next = normalizeSettings(merged);
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
    // { [pageKey]: Highlight[] }
  });
  function isPlainObject2(v) {
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
  function normalizeStore(raw) {
    const s = isPlainObject2(raw) ? raw : {};
    const byPage = isPlainObject2(s.byPage) ? s.byPage : {};
    return { _v: 1, byPage };
  }
  function makeId() {
    return `hl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  function normalizeColor(c) {
    const v = typeof c === "string" ? c : "yellow";
    return ["yellow", "green", "blue", "pink"].includes(v) ? v : "yellow";
  }
  function createHighlightsHandlers() {
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
        const anchor = isPlainObject2(payload?.anchor) ? payload.anchor : null;
        if (!anchor) return { ok: false, error: "anchor is required" };
        const res = await storageGet([KEY]);
        const store = normalizeStore(res?.[KEY] || DEFAULT);
        const created = {
          id: makeId(),
          pageUrl,
          color,
          anchor,
          createdAt: Date.now()
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
      }
    };
  }

  // core/background/index.js
  var handlers = {
    ...createNotesHandlers(),
    ...createBadgeHandlers(),
    ...createSettingsHandlers(),
    ...createHighlightsHandlers()
  };
  var route = createRouter(handlers);
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
})();

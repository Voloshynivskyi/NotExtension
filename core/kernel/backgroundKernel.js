// core/kernel/backgoundKernel.js
import { createRouter } from "../background/router.js";
import { getFeatures } from "./featureRegistry.js";
import { ContentEventTypes, MessageTypes } from "../shared/protocol.js";
import { tabOrigin } from "../shared/url.js";

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

async function getAllTabs() {
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

// Same as sendToTabBestEffort, but returns the response payload (or null on error).
async function sendToTabRequest(tabId, message) {
  return new Promise((resolve) => {
    if (typeof tabId !== "number") return resolve(null);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(response ?? null);
    });
  });
}

function createBroadcast() {
  return {
    async badgeSetByOrigin(origin, hasNote, fallbackTabId) {
      const o = typeof origin === "string" ? origin.trim() : "";
      if (!o) return { attempted: 0, delivered: 0 };

      const tabs = await getAllTabs();
      const targets = tabs.filter((tab) => tab?.url && tabOrigin(tab.url) === o);

      let delivered = 0;
      for (const tab of targets) {
        if (tab.id == null) continue;
        const res = await sendToTabBestEffort(tab.id, {
          type: ContentEventTypes.BADGE_SET,
          payload: { hasNote: Boolean(hasNote) },
        });
        if (res.ok) delivered += 1;
      }

      if (delivered === 0 && typeof fallbackTabId === "number") {
        await sendToTabBestEffort(fallbackTabId, {
          type: ContentEventTypes.BADGE_SET,
          payload: { hasNote: Boolean(hasNote) },
        });
      }

      return { attempted: targets.length, delivered };
    },

    async highlightsUpdated(pageUrl) {
      const p = normalizePageUrl(pageUrl);
      if (!p) return { attempted: 0, delivered: 0 };

      const tabs = await getAllTabs();
      const targets = tabs.filter((tab) => tab?.url && normalizePageUrl(tab.url) === p);

      let delivered = 0;
      for (const tab of targets) {
        if (tab.id == null) continue;
        const res = await sendToTabBestEffort(tab.id, {
          type: ContentEventTypes.HIGHLIGHTS_UPDATED,
          payload: { pageUrl: p },
        });
        if (res.ok) delivered += 1;
      }

      return { attempted: targets.length, delivered };
    },
  };
}

const CM = Object.freeze({
  ROOT: "notext_root",
  PIN: "notext_pin",
  UNPIN: "notext_unpin",
  REMOVE: "notext_remove",
});

function setupContextMenus() {
  // Контекст-меню зберігається між рестартами SW, тому створюємо на install/update.
  // У dev це також зручно: перезавантажив extension — меню оновилось.
  try {
    chrome.contextMenus.removeAll(() => {
      const err = chrome.runtime.lastError;
      if (err) console.warn("[contextMenus] removeAll:", err.message);

      const rootContexts = ["page", "selection"];
      chrome.contextMenus.create({
        id: CM.ROOT,
        title: "NotExtension",
        contexts: rootContexts,
      });

      // Тримаємо пункти видимими і без активного selection (ПКМ всередині <mark>).
      const itemContexts = ["page", "selection"];

      chrome.contextMenus.create({
        id: CM.PIN,
        parentId: CM.ROOT,
        title: "Pin",
        contexts: itemContexts,
      });

      chrome.contextMenus.create({
        id: CM.UNPIN,
        parentId: CM.ROOT,
        title: "Unpin",
        contexts: itemContexts,
      });

      chrome.contextMenus.create({
        id: CM.REMOVE,
        parentId: CM.ROOT,
        title: "Remove highlight",
        contexts: itemContexts,
      });
    });
  } catch (e) {
    console.warn("[contextMenus] setup failed:", e);
  }
}

export function initBackgroundKernel() {
  const broadcast = createBroadcast();

  const handlers = {};
  for (const feature of getFeatures()) {
    const h = feature.createBackgroundHandlers?.({ broadcast }) ?? {};
    Object.assign(handlers, h);
  }

  const route = createRouter(handlers);

  console.log("Background Service Worker started 🚀");

  chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated");
    setupContextMenus();
  });

  // Контекст-меню: Pin / Unpin / Remove
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      const tabId = tab?.id;
      if (typeof tabId !== "number") return;

      // Просимо content: що саме таргетимо (existing highlight чи новий selection)
      const cap = await sendToTabRequest(tabId, {
        type: MessageTypes.HIGHLIGHT_CAPTURE_SELECTION,
        payload: {},
      });

      if (!cap?.ok) return;

      const pageUrl = normalizePageUrl(cap?.pageUrl || tab?.url || "");
      const kind = cap?.kind;

      const ids = Array.isArray(cap?.highlightIds) ? cap.highlightIds.filter(Boolean) : [];
      const anchor = cap?.anchor ?? null;

      if (!pageUrl) return;

      if (info.menuItemId === CM.PIN) {
        // Нове виділення → створюємо pinned highlight
        if (kind === "new" && anchor) {
          await route({
            type: MessageTypes.HIGHLIGHT_CREATE,
            payload: { pageUrl, color: "yellow", anchor, pinned: true, noteText: "" },
          });
          return;
        }

        // Існуючий highlight(и) → pinned=true
        for (const id of ids) {
          await route({
            type: MessageTypes.HIGHLIGHT_PATCH,
            payload: { pageUrl, id, patch: { pinned: true } },
          });
        }
        return;
      }

      if (info.menuItemId === CM.UNPIN) {
        for (const id of ids) {
          await route({
            type: MessageTypes.HIGHLIGHT_PATCH,
            payload: { pageUrl, id, patch: { pinned: false } },
          });
        }
        return;
      }

      if (info.menuItemId === CM.REMOVE) {
        for (const id of ids) {
          await route({
            type: MessageTypes.HIGHLIGHT_DELETE,
            payload: { pageUrl, id },
          });
        }
      }
    })().catch((e) => console.warn("[contextMenus] click failed:", e));
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      const result = await route(message);
      sendResponse(result);
    })();

    return true;
  });
}

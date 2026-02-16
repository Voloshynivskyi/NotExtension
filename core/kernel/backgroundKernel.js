// core/kernel/backgoundKernel.js
import { createRouter } from "../background/router.js";
import { getFeatures } from "./featureRegistry.js";
import { ContentEventTypes } from "../shared/protocol.js";
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
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      const result = await route(message);
      sendResponse(result);
    })();

    return true;
  });
}

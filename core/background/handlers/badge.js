// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\core\background\handlers\badge.js
import { ContentEventTypes, MessageTypes } from "../../shared/protocol.js";
import { storageGet } from "../../shared/storage.js";
import { tabOrigin } from "../../shared/url.js"

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

export async function broadcastBadgeByOrigin(origin, hasNote, fallbackTabId) {
  const tabs = await getAllTabs();

  const targets = tabs.filter((tab) => tab?.url && tabOrigin(tab.url) === origin);

  let delivered = 0;
  for (const tab of targets) {
    if (tab.id == null) continue;

    const res = await sendMessageToTabBestEffort(tab.id, {
      type: ContentEventTypes.BADGE_SET,
      payload: { hasNote },
    });

    if (res.ok) delivered += 1;
  }

  if (delivered === 0 && typeof fallbackTabId === "number") {
    await sendMessageToTabBestEffort(fallbackTabId, {
      type: ContentEventTypes.BADGE_SET,
      payload: { hasNote },
    });
  }

  return { attempted: targets.length, delivered };
}

export function createBadgeHandlers() {
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
    },
  };
}

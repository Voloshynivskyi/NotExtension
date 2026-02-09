// extension/background/service-worker.js
console.log("Background Service Worker started 🚀");

// ---------- Helpers ----------

async function getAllTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({}, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(tabs || []);
    });
  });
}

function tabOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

async function sendMessageToTabBestEffort(tabId, message) {
  return new Promise((resolve) => {
    // Guard: invalid tabId
    if (typeof tabId !== "number") {
      resolve({ ok: false, error: "Invalid tabId" });
      return;
    }

    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Common case: no content script in this tab, ignore
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, response });
      }
    });
  });
}

const ContentMessageTypes = Object.freeze({
  BADGE_SET: "BADGE_SET",
  BADGE_STATUS_GET: "BADGE_STATUS_GET",
});

/**
 * Broadcast badge update to all tabs that match origin.
 * Returns delivery stats so we can do a real fallback if needed.
 */
async function broadcastBadgeByOrigin(origin, hasNote) {
  const tabs = await getAllTabs();

  const targets = tabs.filter((tab) => {
    if (!tab?.url) return false;
    return tabOrigin(tab.url) === origin;
  });

  let delivered = 0;

  for (const tab of targets) {
    if (tab.id == null) continue;

    const res = await sendMessageToTabBestEffort(tab.id, {
      type: ContentMessageTypes.BADGE_SET,
      payload: { hasNote },
    });

    if (res.ok) delivered += 1;
  }

  return { attempted: targets.length, delivered };
}

// ---------- Storage helper ----------

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
    });
  });
}

// ---------- Popup → Background protocol ----------

const PopupMessageTypes = Object.freeze({
  NOTE_SET: "NOTE_SET",
  NOTE_GET: "NOTE_GET",
});

// ---------- Handlers (router) ----------

const handlers = {
  async [PopupMessageTypes.NOTE_SET](payload) {
    const { tabId, origin, text } = payload ?? {};

    // Validation
    if (typeof origin !== "string" || origin.trim() === "") {
      return { ok: false, error: "Invalid origin" };
    }
    if (typeof text !== "string") {
      return { ok: false, error: "Invalid text" };
    }
    if (text.length > 10_000) {
      return { ok: false, error: "Note is too long (max 10k chars)" };
    }

    // Save note (key = origin)
    await storageSet({ [origin]: text });

    // Determine badge state
    const hasNote = text.trim().length > 0;

    // 1) Try broadcast to all tabs of this origin
    let delivered = 0;
    try {
      const stats = await broadcastBadgeByOrigin(origin, hasNote);
      delivered = stats.delivered;
    } catch (e) {
      console.warn("Broadcast failed:", e instanceof Error ? e.message : e);
    }

    // 2) Real fallback: if broadcast delivered to zero tabs, try tabId (if provided)
    if (delivered === 0 && typeof tabId === "number") {
      await sendMessageToTabBestEffort(tabId, {
        type: ContentMessageTypes.BADGE_SET,
        payload: { hasNote },
      });
    }

    return { ok: true };
  },
  async [PopupMessageTypes.NOTE_GET](payload) {
    const { origin } = payload ?? {};

    if (typeof origin !== "string" || origin.trim() === "") {
      return { ok: false, error: "Invalid origin" };
    }

    return new Promise((resolve) => {
      chrome.storage.local.get([origin], (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }

        resolve({ ok: true, note: result[origin] || "" });
      });
    });
  },
  async [ContentMessageTypes.BADGE_STATUS_GET](payload) {
    const { origin } = payload ?? {};

    if (typeof origin !== "string" || origin.trim() === "") {
      return { ok: false, error: "Invalid origin" };
    }

    return new Promise((resolve) => {
      chrome.storage.local.get([origin], (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }

        const note = result?.[origin] ?? "";
        const hasNote = typeof note === "string" && note.trim().length > 0;

        resolve({ ok: true, hasNote });
      });
    });
  }

};

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");
});

// ---------- Main listener ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const { type, payload } = message ?? {};
      const handler = handlers[type];

      if (!handler) {
        sendResponse({ ok: false, error: `Unknown message type: ${String(type)}` });
        return;
      }

      const result = await handler(payload);
      sendResponse(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      sendResponse({ ok: false, error: msg });
    }
  })();

  return true;
});

// File: core/content/index.js
// Purpose: Entry point for the content script and runtime message handling.
import { ContentEventTypes, MessageTypes } from "../shared/protocol.js";
import { initBadgeFromBackground } from "./init.js";
import {
  isBadgeEnabledForThisSite,
  setBadgeEnabledForThisSite,
  setBadgeVisible,
} from "./ui/badge.js";

import { initHighlights } from "./highlights/index.js";

console.log("Hello from Content Script on:", window.location.href);

// Send a message to background and resolve with a response or null.
function sendMessagePromise(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(response);
    });
  });
}

// Refresh badge visibility based on stored note state for the origin.
async function refreshHasNote() {
  const origin = window.location.origin;
  const bRes = await sendMessagePromise({
    type: MessageTypes.BADGE_STATUS_GET,
    payload: { origin },
  });
  if (bRes?.ok && typeof bRes.hasNote === "boolean") {
    setBadgeVisible(bRes.hasNote);
  } else {
    setBadgeVisible(false);
  }
}

// Handle background-to-content events.
async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  const { type, payload } = message;

  switch (type) {
    case ContentEventTypes.BADGE_SET: {
      if (!isBadgeEnabledForThisSite()) return;
      setBadgeVisible(Boolean(payload?.hasNote));
      break;
    }

    case ContentEventTypes.BADGE_ENABLED_SET: {
      const enabled = Boolean(payload?.enabled);
      setBadgeEnabledForThisSite(enabled);

      if (!enabled) {
        setBadgeVisible(false);
        return;
      }

      await refreshHasNote();
      break;
    }

    default:
      break;
  }
}

// Initialize UI and highlight features once.
initBadgeFromBackground();
initHighlights();

// Relay runtime messages through the handler.
chrome.runtime.onMessage.addListener((message) => {
  handleMessage(message);
});

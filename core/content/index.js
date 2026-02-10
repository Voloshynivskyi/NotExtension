// core/content/index.js
import { ContentEventTypes, MessageTypes } from "../shared/protocol.js";
import { initBadgeFromBackground } from "./init.js";
import {
  isBadgeEnabledForThisSite,
  setBadgeEnabledForThisSite,
  setBadgeVisible,
} from "./ui/badge.js";

console.log("Hello from Content Script on:", window.location.href);

function sendMessagePromise(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(response);
    });
  });
}

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

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  const { type, payload } = message;

  switch (type) {
    case ContentEventTypes.BADGE_SET: {
      // ✅ якщо disabled — ігноруємо, не створюємо DOM, не показуємо
      if (!isBadgeEnabledForThisSite()) return;
      setBadgeVisible(Boolean(payload?.hasNote));
      break;
    }

    case ContentEventTypes.BADGE_ENABLED_SET: {
      const enabled = Boolean(payload?.enabled);
      setBadgeEnabledForThisSite(enabled);

      if (!enabled) {
        // 
        setBadgeVisible(false);
        return;
      }

      // 
      await refreshHasNote();
      break;
    }

    default:
      break;
  }
}

initBadgeFromBackground();

chrome.runtime.onMessage.addListener((message) => {
  handleMessage(message);
});

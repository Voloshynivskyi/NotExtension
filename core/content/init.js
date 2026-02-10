// core/content/init.js
import { MessageTypes } from "../shared/protocol.js";
import {
  ensureBadge,
  setBadgeEnabledForThisSite,
  setBadgeVisible,
} from "./ui/badge.js";

function sendMessagePromise(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(response);
    });
  });
}

function isBadgeEnabledForOrigin(settings, origin) {
  const badge = settings?.badge;
  const globalEnabled = badge?.globalEnabled !== false;
  const disabled = Array.isArray(badge?.disabledOrigins) ? badge.disabledOrigins : [];
  return globalEnabled && !disabled.includes(origin);
}

export async function initBadgeFromBackground() {
  const origin = window.location.origin;

  // 1) прочитали settings
  const sRes = await sendMessagePromise({
    type: MessageTypes.SETTINGS_GET,
    payload: {},
  });
  const settings = sRes?.ok ? sRes.settings : null;

  const enabled = isBadgeEnabledForOrigin(settings, origin);
  setBadgeEnabledForThisSite(enabled);

  // ✅ якщо вимкнено — бейдж НЕ створюємо і взагалі не питаємо про hasNote
  if (!enabled) return;

  // 2) якщо enabled — тоді вже працюємо як раніше
  ensureBadge();
  setBadgeVisible(false);

  const bRes = await sendMessagePromise({
    type: MessageTypes.BADGE_STATUS_GET,
    payload: { origin },
  });

  if (bRes?.ok && typeof bRes.hasNote === "boolean") {
    // ✅ показуємо ТІЛЬКИ якщо є нотатка
    setBadgeVisible(bRes.hasNote);
  }
}

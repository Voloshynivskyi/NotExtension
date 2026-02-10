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

  // 1) Load settings.
  const sRes = await sendMessagePromise({
    type: MessageTypes.SETTINGS_GET,
    payload: {},
  });
  const settings = sRes?.ok ? sRes.settings : null;

  const enabled = isBadgeEnabledForOrigin(settings, origin);
  setBadgeEnabledForThisSite(enabled);

  // If disabled, do not create the badge or request note status.
  if (!enabled) return;

  // 2) If enabled, proceed with normal behavior.
  ensureBadge();
  setBadgeVisible(false);

  const bRes = await sendMessagePromise({
    type: MessageTypes.BADGE_STATUS_GET,
    payload: { origin },
  });

  if (bRes?.ok && typeof bRes.hasNote === "boolean") {
    // Show only when a note exists.
    setBadgeVisible(bRes.hasNote);
  }
}

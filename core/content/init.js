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
  // Respect module master toggle (if present).
  if (settings?.modules?.badge === false) return false;

  const badge = settings?.badge;
  const globalEnabled = badge?.globalEnabled !== false;
  const disabled = Array.isArray(badge?.disabledOrigins) ? badge.disabledOrigins : [];
  return globalEnabled && !disabled.includes(origin);
}

let liveSyncInstalled = false;

function computeHasNoteFromStorageValue(v) {
  const text = typeof v === "string" ? v : "";
  return text.trim().length > 0;
}

async function refreshBadgeFromBackground({ origin }) {
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

  // Live sync (no reload): update badge on settings/note changes.
  // - settings: enable/disable badge for this origin
  // - note key (origin): show/hide badge
  // Installed even when currently disabled, so enabling works without reload.
  if (!liveSyncInstalled && chrome?.storage?.onChanged) {
    liveSyncInstalled = true;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      // SETTINGS CHANGED
      if (changes.settings) {
        const nextSettings = changes.settings.newValue;
        const nextEnabled = isBadgeEnabledForOrigin(nextSettings, origin);

        setBadgeEnabledForThisSite(nextEnabled);

        if (nextEnabled) {
          ensureBadge();

          // If note changed in the same transaction, prefer that.
          if (changes[origin]) {
            setBadgeVisible(computeHasNoteFromStorageValue(changes[origin].newValue));
          } else {
            // Otherwise, refresh from background to ensure correctness.
            void refreshBadgeFromBackground({ origin });
          }
        } else {
          setBadgeVisible(false);
        }
      }

      // NOTE CHANGED (origin key)
      if (changes[origin]) {
        const hasNote = computeHasNoteFromStorageValue(changes[origin].newValue);
        setBadgeVisible(hasNote);
      }
    });
  }

  // If disabled, do not create the badge or request note status.
  if (!enabled) return;

  // 2) If enabled, proceed with normal behavior.
  ensureBadge();
  setBadgeVisible(false);

  await refreshBadgeFromBackground({ origin });
}

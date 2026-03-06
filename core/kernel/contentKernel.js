// core/kernel/contentKernel.js
import { ContentEventTypes, MessageTypes } from "../shared/protocol.js";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  isBadgeEnabledForOrigin,
} from "../shared/settingsSchema.js";
import {
  ensureBadge,
  setBadgeEnabledForThisSite,
  setBadgeVisible,
} from "../content/ui/badge.js";

import {
  setHighlightsEnabled,
  setPinsEnabled,
  syncHighlightsFromStore,
  captureSelectionForContextMenu,
} from "../content/highlights/index.js";

import { refreshPinsPanel } from "../content/ui/pinsPanel.js";

const SETTINGS_KEY = "settings";

function sendMessagePromise(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(response);
    });
  });
}

async function loadSettingsOnce() {
  const res = await sendMessagePromise({
    type: MessageTypes.SETTINGS_GET,
    payload: {},
  });
  if (res?.ok && res.settings) return normalizeSettings(res.settings);
  return normalizeSettings(DEFAULT_SETTINGS);
}

async function fetchHasNote(origin) {
  const bRes = await sendMessagePromise({
    type: MessageTypes.BADGE_STATUS_GET,
    payload: { origin },
  });
  if (bRes?.ok && typeof bRes.hasNote === "boolean") return bRes.hasNote;
  return false;
}

function computeHasNoteFromStorageValue(v) {
  const text = typeof v === "string" ? v : "";
  return text.trim().length > 0;
}

function applyThemeToRoot(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
}

export async function initContentKernel() {
  console.log("Hello from Content Script on:", window.location.href);

  const origin = window.location.origin;

  // 1) Load settings (single source of truth)
  let settings = await loadSettingsOnce();

  // 2) Apply theme to page UI roots (used by our injected UI)
  applyThemeToRoot(settings.theme);

  // 3) Init modules (gated)
  const badgeEnabled = isBadgeEnabledForOrigin(settings, origin);
  setBadgeEnabledForThisSite(badgeEnabled);

  // Pins first, then highlights (so restore respects pinsEnabled).
  try {
    await setPinsEnabled(Boolean(settings.modules?.pins));
  } catch (e) {
    console.warn("setPinsEnabled crashed:", e);
  }

  try {
    await setHighlightsEnabled(Boolean(settings.modules?.highlights));
  } catch (e) {
    console.warn("setHighlightsEnabled crashed:", e);
  }

  // Badge init: create only if enabled
  if (settings.modules?.badge && badgeEnabled) {
    ensureBadge();
    setBadgeVisible(false);
    const hasNote = await fetchHasNote(origin);
    setBadgeVisible(hasNote);
  }

  // 4) Observe settings changes for realtime toggle/theme updates
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!changes[SETTINGS_KEY]) return;

    const nextSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    settings = nextSettings;

    // Theme live-update
    applyThemeToRoot(settings.theme);

    // Badge enabled by site rules
    const enabledNow = isBadgeEnabledForOrigin(settings, origin);
    setBadgeEnabledForThisSite(enabledNow);

    // Module gating
    void setPinsEnabled(Boolean(settings.modules?.pins)).catch((e) =>
      console.warn("setPinsEnabled failed:", e)
    );

    void setHighlightsEnabled(Boolean(settings.modules?.highlights)).catch((e) =>
      console.warn("setHighlightsEnabled failed:", e)
    );
  });

  async function handleMessage(message) {
    const { type, payload } = message ?? {};

    switch (type) {
      case ContentEventTypes.BADGE_SET: {
        if (!settings.modules?.badge) return;
        if (!isBadgeEnabledForOrigin(settings, origin)) return;
        ensureBadge();
        setBadgeVisible(Boolean(payload?.hasNote));
        break;
      }

      case ContentEventTypes.BADGE_ENABLED_SET: {
        // This is best-effort realtime update from popup for current tab
        const enabled = Boolean(payload?.enabled);
        setBadgeEnabledForThisSite(enabled);

        if (!enabled) {
          setBadgeVisible(false);
          return;
        }

        if (!settings.modules?.badge) return;
        ensureBadge();
        const hasNote = await fetchHasNote(origin);
        setBadgeVisible(hasNote);
        break;
      }

      case ContentEventTypes.HIGHLIGHTS_UPDATED: {
        if (!settings.modules?.highlights) return;

        try {
          await syncHighlightsFromStore();
        } catch (e) {
          console.warn("syncHighlightsFromStore failed:", e);
        }

        if (settings.modules?.pins) {
          try {
            await refreshPinsPanel();
          } catch (e) {
            console.warn("refreshPinsPanel failed:", e);
          }
        }

        break;
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Request/response message used by background context-menu actions.
    if (message?.type === MessageTypes.HIGHLIGHT_CAPTURE_SELECTION) {
      void (async () => {
        // Respect module gating (highlights must be enabled).
        if (!settings.modules?.highlights) {
          sendResponse({ ok: false, error: "highlights disabled" });
          return;
        }

        try {
          const res = captureSelectionForContextMenu();
          sendResponse(res);
        } catch (e) {
          console.warn("captureSelectionForContextMenu failed:", e);
          sendResponse({ ok: false, error: "capture failed" });
        }
      })();

      return true; // keep SW channel open for async sendResponse
    }

    void handleMessage(message).catch((e) =>
      console.warn("Content handleMessage failed:", e)
    );

    return false;
  });
}

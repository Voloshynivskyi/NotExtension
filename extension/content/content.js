(() => {
  // core/shared/protocol.js
  var MessageTypes = Object.freeze({
    NOTE_SET: "NOTE_SET",
    NOTE_GET: "NOTE_GET",
    NOTE_DELETE: "NOTE_DELETE",
    BADGE_STATUS_GET: "BADGE_STATUS_GET",
    SETTINGS_GET: "SETTINGS_GET",
    SETTINGS_PATCH: "SETTINGS_PATCH"
  });
  var ContentEventTypes = Object.freeze({
    BADGE_SET: "BADGE_SET",
    BADGE_ENABLED_SET: "BADGE_ENABLED_SET"
  });

  // core/content/ui/badge.js
  var BADGE_ID = "notextension-note-badge";
  var Z_INDEX = 2147483647;
  var badgeEl = null;
  var enabledForThisSite = true;
  function setBadgeEnabledForThisSite(enabled) {
    enabledForThisSite = Boolean(enabled);
    if (!enabledForThisSite) {
      destroyBadge();
    }
  }
  function isBadgeEnabledForThisSite() {
    return enabledForThisSite;
  }
  function ensureBadge() {
    if (!enabledForThisSite) return null;
    if (badgeEl && document.contains(badgeEl)) return badgeEl;
    badgeEl = document.createElement("div");
    badgeEl.id = BADGE_ID;
    Object.assign(badgeEl.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      zIndex: String(Z_INDEX),
      display: "none",
      padding: "6px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      lineHeight: "1",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      background: "rgba(26, 115, 232, 0.92)",
      color: "#fff",
      boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
      userSelect: "none",
      cursor: "default"
    });
    badgeEl.textContent = "\u{1F4DD} Note";
    const mount = () => {
      const parent = document.body || document.documentElement;
      if (parent && badgeEl && !parent.contains(badgeEl)) parent.appendChild(badgeEl);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
    return badgeEl;
  }
  function destroyBadge() {
    if (badgeEl && badgeEl.parentNode) {
      badgeEl.parentNode.removeChild(badgeEl);
    }
    badgeEl = null;
  }
  function setBadgeVisible(hasNote) {
    if (!enabledForThisSite) return;
    const el = ensureBadge();
    if (!el) return;
    const visible = Boolean(hasNote);
    el.style.display = visible ? "block" : "none";
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  // core/content/init.js
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
  async function initBadgeFromBackground() {
    const origin = window.location.origin;
    const sRes = await sendMessagePromise({
      type: MessageTypes.SETTINGS_GET,
      payload: {}
    });
    const settings = sRes?.ok ? sRes.settings : null;
    const enabled = isBadgeEnabledForOrigin(settings, origin);
    setBadgeEnabledForThisSite(enabled);
    if (!enabled) return;
    ensureBadge();
    setBadgeVisible(false);
    const bRes = await sendMessagePromise({
      type: MessageTypes.BADGE_STATUS_GET,
      payload: { origin }
    });
    if (bRes?.ok && typeof bRes.hasNote === "boolean") {
      setBadgeVisible(bRes.hasNote);
    }
  }

  // core/content/index.js
  console.log("Hello from Content Script on:", window.location.href);
  function sendMessagePromise2(message) {
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
    const bRes = await sendMessagePromise2({
      type: MessageTypes.BADGE_STATUS_GET,
      payload: { origin }
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
  initBadgeFromBackground();
  chrome.runtime.onMessage.addListener((message) => {
    handleMessage(message);
  });
})();

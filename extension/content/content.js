// extension/content/content.js
// Minimal, scalable content script for a "has note" badge.
// Responsibility: UI only (render + update). No storage logic.

(() => {
  // ----- Protocol (message types) -----
  const MessageTypes = Object.freeze({
    BADGE_SET: "BADGE_SET", // payload: { hasNote: boolean }
    BADGE_STATUS_GET: "BADGE_STATUS_GET", // payload: { origin: string }
  });

  // ----- DOM IDs / constants -----
  const BADGE_ID = "notextension-note-badge";
  const Z_INDEX = 2147483647; // max-ish, keeps badge on top

  // ----- Internal state -----
  let badgeEl = null;

  // ----- Create badge element once -----
  function ensureBadge() {
    if (badgeEl && document.contains(badgeEl)) return badgeEl;

    badgeEl = document.createElement("div");
    badgeEl.id = BADGE_ID;

    // Minimal style (safe defaults). You can theme later.
    Object.assign(badgeEl.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      zIndex: String(Z_INDEX),
      display: "none", // default hidden
      padding: "6px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      lineHeight: "1",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      background: "rgba(26, 115, 232, 0.92)",
      color: "#fff",
      boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
      userSelect: "none",
      cursor: "default",
    });

    badgeEl.textContent = "📝 Note";

    // Attach after DOM is ready-ish
    if (document.documentElement) {
      document.documentElement.appendChild(badgeEl);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.appendChild(badgeEl);
      });
    }

    return badgeEl;
  }

  // ----- Show/hide badge (single responsibility) -----
  function setBadgeVisible(hasNote) {
    const el = ensureBadge();
    el.style.display = hasNote ? "block" : "none";
    // Optional: accessibility
    el.setAttribute("aria-hidden", hasNote ? "false" : "true");
  }

  // ----- Message handler (router-ready) -----
  function handleMessage(message) {
    if (!message || typeof message !== "object") return;

    const { type, payload } = message;

    switch (type) {
      case MessageTypes.BADGE_SET: {
        const hasNote = Boolean(payload?.hasNote);
        setBadgeVisible(hasNote);
        break;
      }
      default:
        // Unknown messages are ignored (future-proof)
        break;
    }
  }

  chrome.runtime.sendMessage({ type: MessageTypes.BADGE_STATUS_GET, payload: { origin: window.location.origin } }, (response) => {
    const err = chrome.runtime.lastError
    if (err) {
      // Optional: handle error (not critical)
      return;
    }
    if (response?.ok && response.hasNote !== undefined) {
      setBadgeVisible(response.hasNote);
    }
  });

  // ----- Listen for updates from background -----
  chrome.runtime.onMessage.addListener((message) => {
    handleMessage(message);
    // No async response needed here
  });

  // Ensure badge exists (still hidden) so updates are instant
  ensureBadge();
})();

// core/content/ui/badge.js
const BADGE_ID = "notextension-note-badge";
const Z_INDEX = 2147483647;

let badgeEl = null;
let enabledForThisSite = true;

export function setBadgeEnabledForThisSite(enabled) {
  enabledForThisSite = Boolean(enabled);

  // If disabled, remove permanently (DOM and visibility).
  if (!enabledForThisSite) {
    destroyBadge();
  }
}

export function isBadgeEnabledForThisSite() {
  return enabledForThisSite;
}

export function ensureBadge() {
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
    cursor: "default",
  });

  badgeEl.textContent = "📝 Note";

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

export function destroyBadge() {
  if (badgeEl && badgeEl.parentNode) {
    badgeEl.parentNode.removeChild(badgeEl);
  }
  badgeEl = null;
}

export function setBadgeVisible(hasNote) {
  // If disabled, never show the badge.
  if (!enabledForThisSite) return;

  const el = ensureBadge();
  if (!el) return;

  const visible = Boolean(hasNote);
  el.style.display = visible ? "block" : "none";
  el.setAttribute("aria-hidden", visible ? "false" : "true");
}

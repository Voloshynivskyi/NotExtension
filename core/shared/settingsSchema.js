// File: core/shared/settingsSchema.js
// Purpose: Single source of truth for settings defaults + normalization.

export const SETTINGS_KEY = "settings";

export const DEFAULT_SETTINGS = Object.freeze({
  _v: 1,

  autosaveEnabled: true,
  theme: "light", // "light" | "dark"

  modules: {
    badge: true,
    highlights: true,
    pins: true,
  },

  badge: {
    globalEnabled: true,
    disabledOrigins: [],
  },
});

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function normalizeTheme(v) {
  return v === "dark" ? "dark" : "light";
}

function normalizeBool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}

function uniqStrings(arr) {
  const raw = Array.isArray(arr) ? arr : [];
  const trimmed = raw
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

function normalizeModules(raw) {
  const m = isPlainObject(raw) ? raw : {};
  const d = DEFAULT_SETTINGS.modules;

  const out = {
    badge: normalizeBool(m.badge, d.badge),
    highlights: normalizeBool(m.highlights, d.highlights),
    pins: normalizeBool(m.pins, d.pins),
  };

  // ✅ ІНВАРІАНТ: pins не можуть існувати без highlights
  if (out.highlights === false) out.pins = false;

  return out;
}

function normalizeBadge(raw) {
  const b = isPlainObject(raw) ? raw : {};
  return {
    globalEnabled: normalizeBool(b.globalEnabled, true),
    disabledOrigins: uniqStrings(b.disabledOrigins),
  };
}

export function normalizeSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  return {
    _v: 1,
    autosaveEnabled: normalizeBool(s.autosaveEnabled, true),
    theme: normalizeTheme(s.theme),
    modules: normalizeModules(s.modules),
    badge: normalizeBadge(s.badge),
  };
}

export function applySettingsPatch(current, patch) {
  const merged = deepMerge(current, patch);
  return normalizeSettings(merged);
}

export function isBadgeEnabledForOrigin(settings, origin) {
  const o = typeof origin === "string" ? origin.trim() : "";
  if (!o) return false;

  const s = settings && typeof settings === "object" ? settings : DEFAULT_SETTINGS;
  if (s.modules?.badge === false) return false;

  const badge = s.badge ?? DEFAULT_SETTINGS.badge;
  if (badge.globalEnabled === false) return false;

  const disabled = Array.isArray(badge.disabledOrigins) ? badge.disabledOrigins : [];
  return !disabled.includes(o);
}

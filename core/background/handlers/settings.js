// core/background/handlers/settings.js
import { MessageTypes } from "../../shared/protocol.js";
import { storageGet, storageSet } from "../../shared/storage.js";

const SETTINGS_KEY = "settings";

const DEFAULT_SETTINGS = Object.freeze({
  _v: 1,
  autosaveEnabled: true,
  theme: "light",
  badge: {
    globalEnabled: true,
    disabledOrigins: [],
  },
});

// простий deepMerge для майбутніх вкладених секцій
function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function deepMerge(base, patch) {
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

function normalizeBadge(badgeRaw) {
  const b = badgeRaw && typeof badgeRaw === "object" ? badgeRaw : {};
  const globalEnabled = typeof b.globalEnabled === "boolean" ? b.globalEnabled : true;

  const arr = Array.isArray(b.disabledOrigins) ? b.disabledOrigins : [];
  const disabledOrigins = Array.from(
    new Set(arr.filter((x) => typeof x === "string" && x.trim().length > 0))
  );

  return { globalEnabled, disabledOrigins };
}

function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    _v: 1,
    autosaveEnabled: typeof s.autosaveEnabled === "boolean" ? s.autosaveEnabled : true,
    theme: s.theme === "dark" ? "dark" : "light",
    badge: normalizeBadge(s.badge),
  };
}


export function createSettingsHandlers() {
  return {
    async [MessageTypes.SETTINGS_GET]() {
      const res = await storageGet([SETTINGS_KEY]);
      const stored = res?.[SETTINGS_KEY];
      const settings = normalizeSettings(stored || DEFAULT_SETTINGS);

      // якщо нічого не було — збережемо дефолти одразу
      if (!stored) await storageSet({ [SETTINGS_KEY]: settings });

      return { ok: true, settings };
    },

    async [MessageTypes.SETTINGS_PATCH](payload) {
      const patch = isPlainObject(payload?.patch) ? payload.patch : {};

      const res = await storageGet([SETTINGS_KEY]);
      const current = normalizeSettings(res?.[SETTINGS_KEY] || DEFAULT_SETTINGS);

      // patch може бути великим/вкладеним — deep merge
      const merged = deepMerge(current, patch);
      const next = normalizeSettings(merged);

      await storageSet({ [SETTINGS_KEY]: next });
      return { ok: true, settings: next };
    },
  };
}

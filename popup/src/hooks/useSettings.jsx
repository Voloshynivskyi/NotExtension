// File: popup/src/hooks/useSettings.jsx
// Purpose: Manage popup/settings state and propagate badge changes to content.
import React from "react";
import * as settingsApi from "../extension/settingsApi";
import { ContentEventTypes } from "@core/shared/protocol";
import { getActiveTab } from "../extension/tabs";

const DEFAULT = {
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
};

const SETTINGS_KEY = "settings";

function uniqStrings(arr) {
  const raw = Array.isArray(arr) ? arr : [];
  const trimmed = raw
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

function toggleOriginInList(list, origin) {
  const o = typeof origin === "string" ? origin.trim() : "";
  if (!o) return uniqStrings(list);

  const set = new Set(uniqStrings(list));
  if (set.has(o)) set.delete(o);
  else set.add(o);

  return Array.from(set);
}

function isBadgeEnabledForOriginFromSettings(s, origin) {
  const o = typeof origin === "string" ? origin.trim() : "";
  if (!o) return false;

  if (s?.modules?.badge === false) return false;

  const badge = s?.badge ?? DEFAULT.badge;
  if (badge.globalEnabled === false) return false;

  const disabled = Array.isArray(badge.disabledOrigins)
    ? badge.disabledOrigins
    : [];
  return !disabled.includes(o);
}

function normalizeSettingsIn(s) {
  const raw = s && typeof s === "object" ? s : {};

  const badgeRaw = raw.badge && typeof raw.badge === "object" ? raw.badge : {};
  const modulesRaw =
    raw.modules && typeof raw.modules === "object" ? raw.modules : {};

  const out = {
    _v: 1,
    autosaveEnabled:
      typeof raw.autosaveEnabled === "boolean" ? raw.autosaveEnabled : true,
    theme: raw.theme === "dark" ? "dark" : "light",
    modules: {
      badge: typeof modulesRaw.badge === "boolean" ? modulesRaw.badge : true,
      highlights:
        typeof modulesRaw.highlights === "boolean"
          ? modulesRaw.highlights
          : true,
      pins: typeof modulesRaw.pins === "boolean" ? modulesRaw.pins : true,
    },
    badge: {
      globalEnabled: badgeRaw.globalEnabled !== false,
      disabledOrigins: uniqStrings(badgeRaw.disabledOrigins),
    },
  };

  // Invariant: pins cannot be enabled without highlights.
  if (out.modules.highlights === false) out.modules.pins = false;

  return out;
}

function safeParseOrigin(url) {
  try {
    if (!url || typeof url !== "string") return "";
    return new URL(url).origin;
  } catch {
    return "";
  }
}

async function notifyActiveTabBadgeEnabled(enabled, expectedOrigin = "") {
  try {
    if (!chrome?.tabs?.sendMessage) return;

    const tab = await getActiveTab();
    const tabId = tab?.id;

    if (typeof tabId !== "number") return;

    const tabOrigin = safeParseOrigin(tab?.url);
    if (expectedOrigin && tabOrigin && tabOrigin !== expectedOrigin) return;

    chrome.tabs.sendMessage(tabId, {
      type: ContentEventTypes.BADGE_ENABLED_SET,
      payload: { enabled: Boolean(enabled) },
    });
  } catch {
    // ignore
  }
}

export function useSettings() {
  const [settings, setSettings] = React.useState(DEFAULT);
  const [loaded, setLoaded] = React.useState(false);

  const seqRef = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await settingsApi.getSettings();
        if (cancelled) return;
        if (res?.ok && res.settings)
          setSettings(normalizeSettingsIn(res.settings));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!chrome?.storage?.onChanged) return;

    const onChanged = (changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes || !changes[SETTINGS_KEY]) return;

      const next = changes[SETTINGS_KEY].newValue;
      setSettings(normalizeSettingsIn(next));
      setLoaded(true);
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  function patchOptimistic(patchObj) {
    const seq = ++seqRef.current;

    setSettings((prev) => {
      const prevSnap = prev;

      const next = {
        ...prev,
        ...patchObj,

        badge: patchObj?.badge
          ? { ...(prev.badge ?? DEFAULT.badge), ...patchObj.badge }
          : (prev.badge ?? DEFAULT.badge),

        modules: patchObj?.modules
          ? { ...(prev.modules ?? DEFAULT.modules), ...patchObj.modules }
          : (prev.modules ?? DEFAULT.modules),
      };

      next.badge.disabledOrigins = uniqStrings(next.badge.disabledOrigins);

      // Enforce the same invariant in the optimistic UI state.
      if (next.modules?.highlights === false) next.modules.pins = false;

      (async () => {
        try {
          const res = await settingsApi.patchSettings(patchObj);
          if (seqRef.current !== seq) return;

          if (res?.ok && res.settings) {
            setSettings(normalizeSettingsIn(res.settings));
          } else {
            setSettings(prevSnap);
          }
        } catch {
          if (seqRef.current !== seq) return;
          setSettings(prevSnap);
        }
      })();

      return next;
    });
  }

  function isBadgeEnabledForOrigin(origin) {
    return isBadgeEnabledForOriginFromSettings(settings, origin);
  }

  function toggleBadgeForOrigin(origin) {
    const o = typeof origin === "string" ? origin.trim() : "";
    if (!o) return;

    const seq = ++seqRef.current;

    setSettings((prev) => {
      const prevSnap = prev;

      const prevBadge = prev?.badge ?? DEFAULT.badge;
      const nextDisabled = toggleOriginInList(prevBadge.disabledOrigins, o);

      const next = {
        ...prev,
        badge: {
          ...prevBadge,
          disabledOrigins: uniqStrings(nextDisabled),
        },
      };

      const enabledNext = isBadgeEnabledForOriginFromSettings(next, o);
      void notifyActiveTabBadgeEnabled(enabledNext, o);

      (async () => {
        try {
          const res = await settingsApi.patchSettings({ badge: next.badge });
          if (seqRef.current !== seq) return;

          if (res?.ok && res.settings) {
            setSettings(normalizeSettingsIn(res.settings));
          } else {
            setSettings(prevSnap);
            const enabledPrev = isBadgeEnabledForOriginFromSettings(
              prevSnap,
              o,
            );
            void notifyActiveTabBadgeEnabled(enabledPrev, o);
          }
        } catch {
          if (seqRef.current !== seq) return;

          setSettings(prevSnap);
          const enabledPrev = isBadgeEnabledForOriginFromSettings(prevSnap, o);
          void notifyActiveTabBadgeEnabled(enabledPrev, o);
        }
      })();

      return next;
    });
  }

  // ✅ Modules API для Options
  function setModuleEnabled(moduleKey, enabled) {
    const key = String(moduleKey || "").trim();
    const on = Boolean(enabled);

    if (!["badge", "highlights", "pins"].includes(key)) return;

    // ✅ якщо вимикаємо highlights — pins вимикаються автоматично
    if (key === "highlights" && on === false) {
      patchOptimistic({
        modules: { highlights: false, pins: false },
      });
      return;
    }

    // ✅ якщо вмикаємо pins — highlights вмикаємо теж (бо pins залежать від highlights)
    if (
      key === "pins" &&
      on === true &&
      settings.modules?.highlights === false
    ) {
      patchOptimistic({
        modules: { highlights: true, pins: true },
      });
      return;
    }

    patchOptimistic({
      modules: { [key]: on },
    });
  }

  return {
    loaded,

    autosaveEnabled: settings.autosaveEnabled,
    theme: settings.theme,

    modules: settings.modules,
    setModuleEnabled,

    badgeGlobalEnabled: settings.badge?.globalEnabled ?? true,
    badgeDisabledOrigins: settings.badge?.disabledOrigins ?? [],
    isBadgeEnabledForOrigin,
    toggleBadgeForOrigin,

    setAutosaveEnabled: (fnOrVal) => {
      setSettings((prev) => {
        const nextVal =
          typeof fnOrVal === "function"
            ? fnOrVal(prev.autosaveEnabled)
            : fnOrVal;

        patchOptimistic({ autosaveEnabled: Boolean(nextVal) });
        return prev;
      });
    },

    setTheme: (fnOrVal) => {
      setSettings((prev) => {
        const nextVal =
          typeof fnOrVal === "function" ? fnOrVal(prev.theme) : fnOrVal;

        patchOptimistic({ theme: nextVal === "dark" ? "dark" : "light" });
        return prev;
      });
    },

    setBadgeGlobalEnabled: (fnOrVal) => {
      const seq = ++seqRef.current;

      setSettings((prev) => {
        const prevSnap = prev;

        const curr = prev.badge?.globalEnabled ?? true;
        const nextVal = typeof fnOrVal === "function" ? fnOrVal(curr) : fnOrVal;

        const prevBadge = prev?.badge ?? DEFAULT.badge;

        const next = {
          ...prev,
          badge: {
            ...prevBadge,
            globalEnabled: Boolean(nextVal),
            disabledOrigins: uniqStrings(prevBadge.disabledOrigins),
          },
        };

        (async () => {
          try {
            const tab = await getActiveTab();
            const o = safeParseOrigin(tab?.url);

            if (o) {
              const enabledNext = isBadgeEnabledForOriginFromSettings(next, o);
              void notifyActiveTabBadgeEnabled(enabledNext, o);
            } else {
              if (next.badge.globalEnabled === false) {
                void notifyActiveTabBadgeEnabled(false, "");
              }
            }
          } catch {
            // ignore
          }
        })();

        (async () => {
          try {
            const res = await settingsApi.patchSettings({ badge: next.badge });
            if (seqRef.current !== seq) return;

            if (res?.ok && res.settings) {
              setSettings(normalizeSettingsIn(res.settings));
            } else {
              setSettings(prevSnap);
            }
          } catch {
            if (seqRef.current !== seq) return;
            setSettings(prevSnap);
          }
        })();

        return next;
      });
    },
  };
}

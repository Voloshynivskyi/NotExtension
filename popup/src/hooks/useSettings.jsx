// popup/src/hooks/useSettings.jsx
import React from "react";
import * as settingsApi from "../extension/settingsApi";

const DEFAULT = {
  _v: 2,
  autosaveEnabled: true,
  theme: "light", // "light" | "dark"
  badge: {
    globalEnabled: true,
    disabledOrigins: [],
  },
};

function uniqStrings(arr) {
  return Array.from(
    new Set(
      (Array.isArray(arr) ? arr : []).filter(
        (x) => typeof x === "string" && x.trim(),
      ),
    ),
  );
}

function toggleOriginInList(list, origin) {
  const set = new Set(Array.isArray(list) ? list : []);
  if (set.has(origin)) set.delete(origin);
  else set.add(origin);
  return Array.from(set);
}

function isBadgeEnabledForOriginFromSettings(s, origin) {
  if (!origin) return false;
  const badge = s?.badge ?? DEFAULT.badge;
  if (badge.globalEnabled === false) return false;
  const disabled = Array.isArray(badge.disabledOrigins)
    ? badge.disabledOrigins
    : [];
  return !disabled.includes(origin);
}

async function notifyActiveTabBadgeEnabled(origin, enabled) {
  try {
    if (!origin) return;
    if (!chrome?.tabs?.query || !chrome?.tabs?.sendMessage) return;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    if (!tab?.id) return;

    // В content ми будемо перевіряти origin, щоб випадково не вплинути на іншу вкладку
    chrome.tabs.sendMessage(tab.id, {
      type: "BADGE_ENABLED_SET",
      payload: { origin, enabled: Boolean(enabled) },
    });
  } catch {
    // ігноруємо (наприклад, якщо немає permission або content не інжектнувся)
  }
}

export function useSettings() {
  const [settings, setSettings] = React.useState(DEFAULT);
  const [loaded, setLoaded] = React.useState(false);

  // seq для "останній запит перемагає"
  const seqRef = React.useRef(0);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await settingsApi.getSettings();
        if (cancelled) return;
        if (res?.ok && res.settings) setSettings(res.settings);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function patchOptimistic(patchObj) {
    const seq = ++seqRef.current;

    setSettings((prev) => {
      const prevSnap = prev;

      // shallow merge + акуратно мерджимо badge, якщо він у patch
      const next = {
        ...prev,
        ...patchObj,
        badge: patchObj?.badge
          ? { ...(prev.badge ?? DEFAULT.badge), ...patchObj.badge }
          : (prev.badge ?? DEFAULT.badge),
      };

      // нормалізуємо масив (на випадок сміття)
      next.badge.disabledOrigins = uniqStrings(next.badge.disabledOrigins);

      (async () => {
        try {
          const res = await settingsApi.patchSettings(patchObj);
          if (seqRef.current !== seq) return;

          if (res?.ok && res.settings) {
            setSettings(res.settings);
          } else {
            // rollback
            setSettings(prevSnap);
          }
        } catch {
          if (seqRef.current !== seq) return;
          // rollback
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
    if (!origin) return;

    const seq = ++seqRef.current;

    setSettings((prev) => {
      const prevSnap = prev;

      const prevBadge = prev?.badge ?? DEFAULT.badge;
      const nextDisabled = toggleOriginInList(
        prevBadge.disabledOrigins,
        origin,
      );

      const next = {
        ...prev,
        badge: {
          ...prevBadge,
          disabledOrigins: uniqStrings(nextDisabled),
        },
      };

      const enabledNext = isBadgeEnabledForOriginFromSettings(next, origin);

      // ✅ одразу оновлюємо content на активній вкладці
      notifyActiveTabBadgeEnabled(origin, enabledNext);

      (async () => {
        try {
          const res = await settingsApi.patchSettings({ badge: next.badge });
          if (seqRef.current !== seq) return;

          if (res?.ok && res.settings) {
            setSettings(res.settings);
          } else {
            // rollback + revert content
            setSettings(prevSnap);
            const enabledPrev = isBadgeEnabledForOriginFromSettings(
              prevSnap,
              origin,
            );
            notifyActiveTabBadgeEnabled(origin, enabledPrev);
          }
        } catch {
          if (seqRef.current !== seq) return;
          // rollback + revert content
          setSettings(prevSnap);
          const enabledPrev = isBadgeEnabledForOriginFromSettings(
            prevSnap,
            origin,
          );
          notifyActiveTabBadgeEnabled(origin, enabledPrev);
        }
      })();

      return next;
    });
  }

  return {
    loaded,

    autosaveEnabled: settings.autosaveEnabled,
    theme: settings.theme,

    // badge section
    badgeGlobalEnabled: settings.badge?.globalEnabled ?? true,
    badgeDisabledOrigins: settings.badge?.disabledOrigins ?? [],
    isBadgeEnabledForOrigin,
    toggleBadgeForOrigin,

    setAutosaveEnabled: (fnOrVal) => {
      const next =
        typeof fnOrVal === "function"
          ? fnOrVal(settings.autosaveEnabled)
          : fnOrVal;

      patchOptimistic({ autosaveEnabled: Boolean(next) });
    },

    setTheme: (fnOrVal) => {
      const next =
        typeof fnOrVal === "function" ? fnOrVal(settings.theme) : fnOrVal;

      patchOptimistic({ theme: next === "dark" ? "dark" : "light" });
    },

    // глобальний master-toggle (для майбутньої сторінки Settings)
    setBadgeGlobalEnabled: (fnOrVal) => {
      const curr = settings.badge?.globalEnabled ?? true;
      const next = typeof fnOrVal === "function" ? fnOrVal(curr) : fnOrVal;

      patchOptimistic({
        badge: {
          globalEnabled: Boolean(next),
          // disabledOrigins залишаємо як є
        },
      });
    },
  };
}

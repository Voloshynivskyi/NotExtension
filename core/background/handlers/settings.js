// File: core/background/handlers/settings.js
// Purpose: Read, normalize, and update extension settings in storage.
import { MessageTypes } from "../../shared/protocol.js";
import { storageGet, storageSet } from "../../shared/storage.js";
import {
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  normalizeSettings,
  applySettingsPatch,
} from "../../shared/settingsSchema.js";

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

// Build handlers for settings message types.
export function createSettingsHandlers() {
  return {
    async [MessageTypes.SETTINGS_GET]() {
      const res = await storageGet([SETTINGS_KEY]);
      const stored = res?.[SETTINGS_KEY];

      const settings = normalizeSettings(stored || DEFAULT_SETTINGS);

      // If no settings exist yet, store defaults immediately.
      if (!stored) await storageSet({ [SETTINGS_KEY]: settings });

      return { ok: true, settings };
    },

    async [MessageTypes.SETTINGS_PATCH](payload) {
      const patch = isPlainObject(payload?.patch) ? payload.patch : {};

      const res = await storageGet([SETTINGS_KEY]);
      const current = normalizeSettings(res?.[SETTINGS_KEY] || DEFAULT_SETTINGS);

      // Apply patch and enforce invariants (e.g., pins require highlights).
      const next = applySettingsPatch(current, patch);

      await storageSet({ [SETTINGS_KEY]: next });
      return { ok: true, settings: next };
    },
  };
}

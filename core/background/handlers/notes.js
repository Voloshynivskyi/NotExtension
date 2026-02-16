// core/background/handlers/notes.js
import { MessageTypes } from "../../shared/protocol.js";
import { storageGet, storageSet, storageRemove } from "../../shared/storage.js";

function validateOrigin(origin) {
  return typeof origin === "string" && origin.trim().length > 0;
}
function validateText(text) {
  return typeof text === "string" && text.length <= 10_000;
}

export function createNotesHandlers({ broadcast } = {}) {
  return {
    async [MessageTypes.NOTE_SET](payload) {
      const { tabId, origin, text } = payload ?? {};

      if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };
      if (!validateText(text)) return { ok: false, error: "Invalid text (max 10k chars)" };

      const trimmed = text.trim();

      if (trimmed.length === 0) {
        await storageRemove([origin]);
        await broadcast?.badgeSetByOrigin?.(origin, false, tabId);
        return { ok: true };
      }

      await storageSet({ [origin]: text });
      await broadcast?.badgeSetByOrigin?.(origin, true, tabId);
      return { ok: true };
    },

    async [MessageTypes.NOTE_GET](payload) {
      const { origin } = payload ?? {};
      if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };

      const result = await storageGet([origin]);
      const note = typeof result[origin] === "string" ? result[origin] : "";
      return { ok: true, note };
    },

    async [MessageTypes.NOTE_DELETE](payload) {
      const { tabId, origin } = payload ?? {};
      if (!validateOrigin(origin)) return { ok: false, error: "Invalid origin" };

      await storageRemove([origin]);
      await broadcast?.badgeSetByOrigin?.(origin, false, tabId);
      return { ok: true };
    },
  };
}

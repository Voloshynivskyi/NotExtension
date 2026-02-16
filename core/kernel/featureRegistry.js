import { createNotesHandlers } from "../background/handlers/notes.js";
import { createBadgeHandlers } from "../background/handlers/badge.js";
import { createSettingsHandlers } from "../background/handlers/settings.js";
import { createHighlightsHandlers } from "../background/handlers/highlights.js";

export function getFeatures() {
  return [
    {
      key: "settings",
      createBackgroundHandlers() {
        return createSettingsHandlers();
      },
    },
    {
      key: "notes",
      createBackgroundHandlers({ broadcast }) {
        return createNotesHandlers({ broadcast });
      },
    },
    {
      key: "badge",
      createBackgroundHandlers() {
        return createBadgeHandlers();
      },
    },
    {
      key: "highlights",
      createBackgroundHandlers({ broadcast }) {
        return createHighlightsHandlers({ broadcast });
      },
    },
  ];
}

// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\core\background\index.js
import { createRouter } from "./router.js";
import { createNotesHandlers } from "./handlers/notes.js";
import { createBadgeHandlers } from "./handlers/badge.js";
import { createSettingsHandlers } from "./handlers/settings.js";
const handlers = {
  ...createNotesHandlers(),
  ...createBadgeHandlers(),
  ...createSettingsHandlers(),
};

const route = createRouter(handlers);

console.log("Background Service Worker started 🚀");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const result = await route(message);
    sendResponse(result);
  })();

  return true;
});

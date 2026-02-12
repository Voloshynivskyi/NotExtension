// File: core/content/highlights/api.js
// Purpose: Content-side API for highlight storage messaging.
import { MessageTypes } from "../../shared/protocol.js";

// Send a message to background and resolve with a response or null.
function sendMessagePromise(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return resolve(null);
      resolve(response);
    });
  });
}

// pageUrl = origin + pathname + search (without hash)
export function getPageUrl() {
  try {
    const u = new URL(window.location.href);
    u.hash = "";
    return u.toString();
  } catch {
    return window.location.href.split("#")[0];
  }
}

// Fetch highlights for a page.
export function listHighlights({ pageUrl }) {
  return sendMessagePromise({
    type: MessageTypes.HIGHLIGHTS_LIST,
    payload: { pageUrl },
  });
}

// Create a highlight for a page.
export function createHighlight({ pageUrl, color, anchor }) {
  return sendMessagePromise({
    type: MessageTypes.HIGHLIGHT_CREATE,
    payload: { pageUrl, color, anchor },
  });
}

// Delete a highlight by id for a page.
export function deleteHighlight({ pageUrl, id }) {
  return sendMessagePromise({
    type: MessageTypes.HIGHLIGHT_DELETE,
    payload: { pageUrl, id },
  });
}

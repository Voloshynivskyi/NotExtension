// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\extension\tabs.js
export function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(tabs?.[0] ?? null);
    });
  });
}

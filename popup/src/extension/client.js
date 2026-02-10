// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\extension\client.js
export function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

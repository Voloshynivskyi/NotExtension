// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\core\shared\storage.js
function lastErrorToError() {
  const err = chrome.runtime.lastError;
  return err ? new Error(err.message) : null;
}

export function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      const e = lastErrorToError();
      if (e) reject(e);
      else resolve(result || {});
    });
  });
}

export function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const e = lastErrorToError();
      if (e) reject(e);
      else resolve();
    });
  });
}

export function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const e = lastErrorToError();
      if (e) reject(e);
      else resolve();
    });
  });
}

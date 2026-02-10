// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\core\shared\url.js
export function getOriginFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function tabOrigin(tabUrl) {
  return getOriginFromUrl(tabUrl);
}

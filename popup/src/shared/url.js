// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\shared\url.js
export function getOriginFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

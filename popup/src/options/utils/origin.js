// popup/src/options/utils/origin.js
export function normalizeOriginInput(input) {
  const raw = (input || "").trim();
  if (!raw) return "";

  try {
    // If the user pasted a full URL, extract the origin.
    const u = new URL(raw);
    return u.origin;
  } catch {
    // If a domain is pasted without a protocol, try https.
    try {
      const u = new URL(`https://${raw}`);
      return u.origin;
    } catch {
      return "";
    }
  }
}

export async function getActiveTabOrigin() {
  try {
    if (!chrome?.tabs?.query) return "";
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs?.[0]?.url || "";
    if (!url) return "";
    const u = new URL(url);
    return u.origin;
  } catch {
    return "";
  }
}

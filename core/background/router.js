// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\core\background\router.js
export function createRouter(handlersByType) {
  return async function route(message) {
    const { type, payload } = message ?? {};
    const handler = handlersByType[type];

    if (!handler) {
      return { ok: false, error: `Unknown message type: ${String(type)}` };
    }

    try {
      return await handler(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, error: msg };
    }
  };
}

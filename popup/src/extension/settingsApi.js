// popup/src/extension/settingsApi.js
import { sendToBackground } from "./client";
import { MessageTypes } from "@core/shared/protocol";

export async function getSettings() {
  return await sendToBackground({
    type: MessageTypes.SETTINGS_GET,
    payload: {},
  });
}

export async function patchSettings(patch) {
  return await sendToBackground({
    type: MessageTypes.SETTINGS_PATCH,
    payload: { patch },
  });
}

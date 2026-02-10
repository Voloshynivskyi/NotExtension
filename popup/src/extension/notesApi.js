// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\extension\notesApi.js
import { sendToBackground } from "./client";
import { MessageTypes } from "./protocol";

export async function getNote(origin) {
  return await sendToBackground({
    type: MessageTypes.NOTE_GET,
    payload: { origin },
  });
}

export async function setNote({ tabId, origin, text }) {
  return await sendToBackground({
    type: MessageTypes.NOTE_SET,
    payload: { tabId, origin, text },
  });
}

export async function deleteNote({ tabId, origin }) {
  return await sendToBackground({
    type: MessageTypes.NOTE_DELETE,
    payload: { tabId, origin },
  });
}

// popup/src/hooks/usePopupNote.jsx
import React from "react";
import { getOriginFromUrl } from "@core/shared/url";
import * as notesApi from "../extension/notesApi";
import { getActiveTab } from "../extension/tabs";

function withTimeout(promise, ms, errorMessage) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(errorMessage)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export function usePopupNote({ autosaveEnabled = true } = {}) {
  const [origin, setOrigin] = React.useState("");
  const [noteText, setNoteText] = React.useState("");
  const [loadedText, setLoadedText] = React.useState("");
  // kind: loading | saving | deleting | error | idle
  const [status, setStatus] = React.useState({ kind: "loading", message: "" });
  const [tabId, setTabId] = React.useState(null);

  const debounceMs = 600;
  const requestTimeoutMs = 8000;

  const saveSeqRef = React.useRef(0);
  const autosaveTimerRef = React.useRef(null);
  const statusResetTimerRef = React.useRef(null);

  // Keep the latest note text to avoid overwriting newer edits after a delete.
  const noteTextRef = React.useRef(noteText);
  React.useEffect(() => {
    noteTextRef.current = noteText;
  }, [noteText]);

  function clearStatusReset() {
    if (statusResetTimerRef.current) {
      clearTimeout(statusResetTimerRef.current);
      statusResetTimerRef.current = null;
    }
  }

  function scheduleStatusReset() {
    clearStatusReset();
    statusResetTimerRef.current = setTimeout(() => {
      setStatus({ kind: "idle", message: "" });
      statusResetTimerRef.current = null;
    }, 900);
  }

  // If autosave is disabled, clear any pending debounce.
  React.useEffect(() => {
    if (autosaveEnabled) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, [autosaveEnabled]);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStatus({ kind: "loading", message: "" });

        const tab = await getActiveTab();
        if (cancelled) return;

        const id = tab?.id ?? null;
        const url = tab?.url ?? "";
        setTabId(id);

        const o = getOriginFromUrl(url);
        setOrigin(o);

        if (!o) {
          setNoteText("");
          setLoadedText("");
          setStatus({ kind: "idle", message: "Not supported page" });
          return;
        }

        const res = await notesApi.getNote(o);
        if (cancelled) return;

        if (res?.ok) {
          const t = res.note ?? "";
          setNoteText(t);
          setLoadedText(t);
          setStatus({ kind: "idle", message: "" });
        } else {
          setStatus({
            kind: "error",
            message: res?.error || "Failed to load note.",
          });
        }
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    })();

    return () => {
      cancelled = true;

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      clearStatusReset();
    };
  }, []);

  const isLoading = status.kind === "loading";
  const isSaving = status.kind === "saving";
  const isDeleting = status.kind === "deleting";
  const isBusy = isSaving || isDeleting;
  const editorDisabled = isLoading || !origin;
  const isDirty = !isLoading && noteText !== loadedText;

  const canSave =
    Boolean(origin) && !isBusy && isDirty && !isLoading && !autosaveEnabled;

  const canDelete =
    Boolean(origin) && !isBusy && !isLoading && loadedText.trim().length > 0;

  const statusText =
    status.kind === "loading"
      ? "Loading…"
      : status.kind === "saving"
        ? "Saving…"
        : status.kind === "deleting"
          ? "Deleting…"
          : status.message
            ? status.message
            : isDirty
              ? "Unsaved"
              : "Ready";

  // Autosave (debounce)
  React.useEffect(() => {
    if (!autosaveEnabled) return;
    if (!origin || isLoading || isBusy) return;
    if (!isDirty) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    const scheduledSeq = ++saveSeqRef.current;
    const scheduledText = noteText;

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        clearStatusReset();

        const trimmed = scheduledText.trim();
        const actionKind = trimmed.length === 0 ? "deleting" : "saving";
        setStatus({ kind: actionKind, message: "" });

        let res;
        if (trimmed.length === 0) {
          res = await withTimeout(
            notesApi.deleteNote({ tabId, origin }),
            requestTimeoutMs,
            "Delete timed out",
          );
        } else {
          res = await withTimeout(
            notesApi.setNote({ tabId, origin, text: scheduledText }),
            requestTimeoutMs,
            "Save timed out",
          );
        }

        if (saveSeqRef.current !== scheduledSeq) return;

        if (!res?.ok) {
          setStatus({ kind: "error", message: res?.error || "Failed to save" });
          return;
        }

        if (trimmed.length === 0) {
          setLoadedText("");

          const current = noteTextRef.current.trim();
          if (current.length === 0) {
            setNoteText("");
            setStatus({ kind: "idle", message: "Deleted" });
            scheduleStatusReset();
          } else {
            setStatus({ kind: "idle", message: "" });
          }
        } else {
          setLoadedText(scheduledText);
          setStatus({ kind: "idle", message: "Saved" });
          scheduleStatusReset();
        }
      } catch (e) {
        if (saveSeqRef.current !== scheduledSeq) return;
        setStatus({
          kind: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        autosaveTimerRef.current = null;
      }
    }, debounceMs);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    noteText,
    origin,
    tabId,
    isDirty,
    isLoading,
    isBusy,
    autosaveEnabled,
    debounceMs,
  ]);

  async function handleSave() {
    if (!origin) return;
    if (autosaveEnabled) return;

    clearStatusReset();
    setStatus({ kind: "saving", message: "" });

    try {
      const text = noteText.trim();
      const seq = ++saveSeqRef.current;

      let res;
      if (text.length === 0) {
        setStatus({ kind: "deleting", message: "" });
        res = await withTimeout(
          notesApi.deleteNote({ tabId, origin }),
          requestTimeoutMs,
          "Delete timed out",
        );
      } else {
        res = await withTimeout(
          notesApi.setNote({ tabId, origin, text: noteText }),
          requestTimeoutMs,
          "Save timed out",
        );
      }

      if (saveSeqRef.current !== seq) return;

      if (!res?.ok) {
        setStatus({ kind: "error", message: res?.error || "Failed to save" });
        return;
      }

      if (text.length === 0) {
        setLoadedText("");
        setNoteText("");
        setStatus({ kind: "idle", message: "Deleted" });
      } else {
        setLoadedText(noteText);
        setStatus({ kind: "idle", message: "Saved" });
      }

      scheduleStatusReset();
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  async function handleDelete() {
    if (!origin) return;

    clearStatusReset();
    setStatus({ kind: "deleting", message: "" });

    try {
      const seq = ++saveSeqRef.current;

      const res = await withTimeout(
        notesApi.deleteNote({ tabId, origin }),
        requestTimeoutMs,
        "Delete timed out",
      );
      if (saveSeqRef.current !== seq) return;

      if (!res?.ok) {
        setStatus({ kind: "error", message: res?.error || "Failed to delete" });
        return;
      }

      setNoteText("");
      setLoadedText("");
      setStatus({ kind: "idle", message: "Deleted" });
      scheduleStatusReset();
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  function handleOpenSettings() {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("popup/options.html") });
    }
  }

  return {
    origin,
    noteText,
    setNoteText,
    loadedText,

    status,
    statusText,

    isLoading,
    isSaving,
    isDeleting,
    isBusy,
    isDirty,
    editorDisabled,

    canSave,
    canDelete,

    handleSave,
    handleDelete,
    handleOpenSettings,
  };
}

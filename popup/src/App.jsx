// popup/src/App.jsx
import React from "react";

function OriginUrl({ origin }) {
  return (
    <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
      Site: <span style={{ color: "#111" }}>{origin || "…"}</span>
    </div>
  );
}

function NoteTextArea({ value, onChange, disabled }) {
  return (
    <textarea
      placeholder="Enter your note here..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        width: "100%",
        height: 110,
        padding: 10,
        fontSize: 14,
        borderRadius: 8,
        border: "1px solid #ccc",
        resize: "none",
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

function SaveButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "10px 14px",
        fontSize: 14,
        borderRadius: 10,
        border: "none",
        backgroundColor: disabled ? "#9bbcf5" : "#1a73e8",
        color: "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      Save
    </button>
  );
}

const MessageTypes = Object.freeze({
  NOTE_SET: "NOTE_SET",
  NOTE_GET: "NOTE_GET",
});

function getOriginFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export default function App() {
  const [origin, setOrigin] = React.useState("");
  const [noteText, setNoteText] = React.useState("");
  const [status, setStatus] = React.useState({ kind: "idle", message: "" }); // idle | saving | saved | error
  const [tabId, setTabId] = React.useState(null);
  React.useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0]?.id;
      const url = tabs?.[0]?.url;
      setTabId(tab);
      const o = getOriginFromUrl(url);
      setOrigin(o);
      chrome.runtime.sendMessage({ type: MessageTypes.NOTE_GET, payload: { origin: o } }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Optional: show error in UI if we fail to get existing note (not critical)
        setStatus({ kind: "error", message: "Failed to load existing note." });
        return;
      }

      if (response?.ok && response.note) {
        setNoteText(response.note);
      }
    });
    });

  }, []);

  const canSave = origin && status.kind !== "saving";

  function handleSave() {
    if (!origin) {
      setStatus({ kind: "error", message: "No active site origin found." });
      return;
    }

    setStatus({ kind: "saving", message: "Saving…" });

    chrome.runtime.sendMessage(
      {
        type: MessageTypes.NOTE_SET,
        payload: { tabId: tabId, origin: origin, text: noteText },
      },
      (response) => {
        // If background failed in a low-level way, Chrome puts it here
        const err = chrome.runtime.lastError;
        if (err) {
          setStatus({ kind: "error", message: err.message });
          return;
        }

        if (!response?.ok) {
          setStatus({ kind: "error", message: response?.error || "Failed to save" });
          return;
        }

        setStatus({ kind: "saved", message: "Saved ✅" });

        // Optional: reset status after a short moment (keeps UI clean)
        setTimeout(() => {
          setStatus({ kind: "idle", message: "" });
        }, 1200);
      }
    );
  }

  return (
    <div style={{ padding: 14, width: 320, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>NotExtension</div>

      <OriginUrl origin={origin} />

      <NoteTextArea
        value={noteText}
        onChange={setNoteText}
        disabled={status.kind === "saving"}
      />

      <SaveButton onClick={handleSave} disabled={!canSave} />

      {status.message ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: status.kind === "error" ? "#b00020" : "#1b5e20",
          }}
        >
          {status.message}
        </div>
      ) : null}
    </div>
  );
}

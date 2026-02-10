// popup/src/options/pages/DataPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { Button, Pill } from "../components/Controls";
import * as settingsApi from "../../extension/settingsApi";

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataPage({ settings }) {
  const fileRef = React.useRef(null);
  const [status, setStatus] = React.useState("");

  async function exportSettings() {
    setStatus("");
    const res = await settingsApi.getSettings();
    if (!res?.ok || !res.settings) {
      setStatus("Failed to export settings.");
      return;
    }
    downloadJson("notextension-settings.json", res.settings);
    setStatus("Exported.");
    setTimeout(() => setStatus(""), 1200);
  }

  async function importSettingsFile(file) {
    setStatus("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // We send a PATCH with the full object — background normalizes it.
      const res = await settingsApi.patchSettings(parsed);
      if (!res?.ok) {
        setStatus("Import failed.");
        return;
      }

      setStatus("Imported.");
      setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Invalid JSON.");
    }
  }

  return (
    <>
      <SettingsCard
        title="Data & Privacy"
        description="Export/import your settings. Notes/highlights/pins export can be added later."
        right={<Pill tone="neutral">Tools</Pill>}
      >
        <div className="opt-inline">
          <Button
            variant="primary"
            onClick={exportSettings}
            disabled={!settings.loaded}
          >
            Export settings (JSON)
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              importSettingsFile(f);
              e.target.value = "";
            }}
          />

          <Button
            onClick={() => fileRef.current?.click()}
            disabled={!settings.loaded}
          >
            Import settings (JSON)
          </Button>

          {status ? <span className="opt-muted">{status}</span> : null}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Planned"
        description="Later we’ll add export/import of notes, highlights, and pins."
      >
        <div className="opt-muted">
          Next step — export/import site data, plus cleanup:
          notes/highlights/pins.
        </div>
      </SettingsCard>
    </>
  );
}

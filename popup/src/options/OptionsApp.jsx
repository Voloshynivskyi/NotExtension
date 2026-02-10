import React from "react";
import { useSettings } from "../hooks/useSettings";

export default function OptionsApp() {
  const settings = useSettings();

  React.useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <h2 style={{ margin: 0 }}>NotExtension — Settings</h2>

      {!settings.loaded ? (
        <div style={{ marginTop: 12 }}>Loading…</div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 520 }}>
          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>Autosave</span>
            <input
              type="checkbox"
              checked={settings.autosaveEnabled}
              onChange={() => settings.setAutosaveEnabled((v) => !v)}
            />
          </label>

          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => settings.setTheme(e.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <span>Badge (global)</span>
            <input
              type="checkbox"
              checked={settings.badgeGlobalEnabled}
              onChange={() => settings.setBadgeGlobalEnabled((v) => !v)}
            />
          </label>

          {/* Пізніше: список disabledOrigins, пошук, кнопки Reset тощо */}
        </div>
      )}
    </div>
  );
}

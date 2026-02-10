// popup/src/options/pages/GeneralPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsRow } from "../components/SettingsRow";
import { Toggle, Select, Pill } from "../components/Controls";

export function GeneralPage({ settings }) {
  return (
    <>
      <SettingsCard
        title="General"
        description="Basic behavior of the extension."
        right={<Pill tone="neutral">Global</Pill>}
      >
        <SettingsRow
          label="Autosave"
          hint="Automatically saves note changes after a short delay."
          control={
            <Toggle
              checked={settings.autosaveEnabled}
              onChange={() => settings.setAutosaveEnabled((v) => !v)}
            />
          }
        />

        <SettingsRow
          label="Theme"
          hint="Affects popup and settings UI."
          control={
            <Select
              value={settings.theme}
              onChange={(v) => settings.setTheme(v)}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Planned"
        description="These settings will appear here as soon as highlights/pins are implemented."
      >
        <SettingsRow
          label="Selection toolbar"
          hint="Show mini-toolbar when selecting text."
          disabled
          control={<Toggle checked={false} onChange={() => {}} disabled />}
        />
        <SettingsRow
          label="Debounce time"
          hint="Autosave delay (300 / 600 / 1000 ms)."
          disabled
          control={
            <Select
              value="600"
              onChange={() => {}}
              disabled
              options={[
                { value: "300", label: "300 ms" },
                { value: "600", label: "600 ms" },
                { value: "1000", label: "1000 ms" },
              ]}
            />
          }
        />
      </SettingsCard>
    </>
  );
}

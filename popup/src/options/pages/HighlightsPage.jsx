// popup/src/options/pages/HighlightsPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsRow } from "../components/SettingsRow";
import { Toggle, Pill } from "../components/Controls";

export function HighlightsPage({ settings }) {
  const enabled = settings.modules?.highlights ?? true;

  return (
    <>
      <SettingsCard
        title="Highlights"
        description="Text selection highlighting on websites."
        right={<Pill tone="neutral">MVP</Pill>}
      >
        <SettingsRow
          label="Enable highlights"
          hint="Applies instantly to currently opened tabs."
          control={
            <Toggle
              checked={enabled}
              onChange={(v) => settings.setModuleEnabled("highlights", v)}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Next"
        description="Color / underline style will be added as soon as we finalize toolbar + pin UX."
      >
        <div className="opt-muted">
          This toggle enables/disables the highlights module.
        </div>
      </SettingsCard>
    </>
  );
}

// popup/src/options/pages/PinsPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsRow } from "../components/SettingsRow";
import { Toggle, Pill } from "../components/Controls";

export function PinsPage({ settings }) {
  const highlightsEnabled = settings.modules?.highlights ?? true;
  const pinsEnabled = settings.modules?.pins ?? true;

  const disabled = !highlightsEnabled;

  return (
    <>
      <SettingsCard
        title="Pins"
        description="Pins are a property of highlights (pinned=true/false)."
        right={<Pill tone="neutral">MVP</Pill>}
      >
        <SettingsRow
          label="Enable pins"
          hint={
            disabled
              ? "Pins require Highlights. Enable highlights first."
              : "Applies instantly to currently opened tabs."
          }
          control={
            <Toggle
              checked={Boolean(pinsEnabled)}
              disabled={disabled}
              onChange={(v) => settings.setModuleEnabled("pins", v)}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Note"
        description="Pins UI (panel + popover) can be extended later."
      >
        <div className="opt-muted">
          When Highlights are disabled, Pins are forced off automatically.
        </div>
      </SettingsCard>
    </>
  );
}

// popup/src/options/pages/GeneralPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsRow } from "../components/SettingsRow";
import { Toggle, Select, Pill } from "../components/Controls";

export function HighlightsPage() {
  return (
    <>
      <SettingsCard
        title="Highlights"
        description="Text selection highlighting (planned)."
        right={<Pill tone="yellow">Planned</Pill>}
      >
        <SettingsRow
          label="Enable highlights"
          hint="When enabled, you can highlight selected text on websites."
          disabled
          control={<Toggle checked={false} onChange={() => {}} disabled />}
        />

        <SettingsRow
          label="Style"
          hint="Background / underline."
          disabled
          control={
            <Select
              value="background"
              onChange={() => {}}
              disabled
              options={[
                { value: "background", label: "Background" },
                { value: "underline", label: "Underline" },
              ]}
            />
          }
        />

        <SettingsRow
          label="Default color"
          hint="Choose the default highlight color."
          disabled
          control={
            <Select
              value="yellow"
              onChange={() => {}}
              disabled
              options={[
                { value: "yellow", label: "Yellow" },
                { value: "blue", label: "Blue" },
                { value: "green", label: "Green" },
                { value: "pink", label: "Pink" },
              ]}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Implementation notes"
        description="MVP approach: store quote + context, restore highlights on page load, mark unresolved ones."
      >
        <div className="opt-muted">
          Until backend normalization for the highlights section is persisted,
          this is only a UI stub. When we add `highlights` to `normalizeSettings`,
          these toggles will become real.
        </div>
      </SettingsCard>
    </>
  );
}

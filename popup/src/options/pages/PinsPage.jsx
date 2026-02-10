// popup/src/options/pages/PinsPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsRow } from "../components/SettingsRow";
import { Toggle, Select, Pill } from "../components/Controls";

export function PinsPage() {
  return (
    <>
      <SettingsCard
        title="Pins"
        description="Pins anchored to text/highlights (planned)."
        right={<Pill tone="blue">Planned</Pill>}
      >
        <SettingsRow
          label="Enable pins"
          hint="Allows creating pins on pages."
          disabled
          control={<Toggle checked={false} onChange={() => {}} disabled />}
        />

        <SettingsRow
          label="Pin size"
          hint="Small / medium / large."
          disabled
          control={
            <Select
              value="m"
              onChange={() => {}}
              disabled
              options={[
                { value: "s", label: "Small" },
                { value: "m", label: "Medium" },
                { value: "l", label: "Large" },
              ]}
            />
          }
        />
      </SettingsCard>

      <SettingsCard
        title="Recommended MVP"
        description="Pins should attach to selected text (quote + context), not absolute coordinates."
      >
        <div className="opt-muted">
          This way pins won't shift during resize/scroll and will be restored
          after a page reload.
        </div>
      </SettingsCard>
    </>
  );
}

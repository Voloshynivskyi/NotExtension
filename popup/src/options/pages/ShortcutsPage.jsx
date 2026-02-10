// popup/src/options/pages/ShortcutsPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { Pill } from "../components/Controls";

export function ShortcutsPage() {
  return (
    <>
      <SettingsCard
        title="Shortcuts"
        description="Keyboard shortcuts will be configured via manifest commands (planned)."
        right={<Pill tone="neutral">Planned</Pill>}
      >
        <div className="opt-muted">
          A list of hotkeys will go here: highlight selection, create pin, toggle badge
          for current site, open side panel.
        </div>
      </SettingsCard>
    </>
  );
}

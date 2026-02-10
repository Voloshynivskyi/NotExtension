// popup/src/options/pages/AboutPage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { Pill } from "../components/Controls";

export function AboutPage() {
  const [ver, setVer] = React.useState("");

  React.useEffect(() => {
    try {
      const m = chrome?.runtime?.getManifest?.();
      setVer(m?.version || "");
    } catch {
      setVer("");
    }
  }, []);

  return (
    <>
      <SettingsCard
        title="About"
        description="Basic extension information."
        right={<Pill tone="neutral">Info</Pill>}
      >
        <div className="opt-muted">
          Version: <b>{ver || "—"}</b>
        </div>
        <div className="opt-muted" style={{ marginTop: 8 }}>
          NotExtension — Smart Page Notes (MVP). Next: highlights, pins, side
          panel.
        </div>
      </SettingsCard>
    </>
  );
}

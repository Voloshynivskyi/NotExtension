// popup/src/options/components/SettingsRow.jsx
import React from "react";

export function SettingsRow({ label, hint, control, disabled }) {
  return (
    <div className={`opt-row ${disabled ? "is-disabled" : ""}`}>
      <div className="opt-row-left">
        <div className="opt-row-label">{label}</div>
        {hint ? <div className="opt-row-hint">{hint}</div> : null}
      </div>
      <div className="opt-row-right">{control}</div>
    </div>
  );
}

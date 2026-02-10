// popup/src/components/BadgeToggle.jsx
import React from "react";
import "./toggles.css";

export function BadgeToggle({ value, onChange, disabled = false }) {
  return (
    <TogglePill
      label="Badge"
      title={value ? "Badge: ON" : "Badge: OFF"}
      checked={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

function TogglePill({ label, title, checked, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`neTgl ${checked ? "neTgl--on" : "neTgl--off"} ${
        disabled ? "neTgl--disabled" : ""
      }`}
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      title={title}
    >
      <span className="neTglLabel">{label}</span>
      <span className="neSwitch" aria-hidden="true">
        <span className="neKnob" />
      </span>
    </button>
  );
}

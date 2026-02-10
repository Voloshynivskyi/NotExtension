// popup/src/options/components/Controls.jsx
import React from "react";

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <label className={`opt-toggle ${disabled ? "is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className="opt-toggle-ui" aria-hidden="true" />
      {label ? <span className="opt-toggle-label">{label}</span> : null}
    </label>
  );
}

export function Select({ value, onChange, options, disabled }) {
  return (
    <select
      className="opt-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, disabled }) {
  return (
    <input
      className="opt-input"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

export function Button({ children, onClick, disabled, variant = "default", title }) {
  return (
    <button
      type="button"
      className={`opt-btn opt-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Pill({ children, tone = "neutral" }) {
  return <span className={`opt-pill opt-pill-${tone}`}>{children}</span>;
}

// popup/src/components/ThemeToggle.jsx
import React from "react";
import "./toggles.css";

export function ThemeToggle({ value, onChange, disabled = false }) {
  const isDark = value === "dark";

  return (
    <button
      type="button"
      className={`neTheme ${isDark ? "neTheme--dark" : "neTheme--light"} ${
        disabled ? "neTheme--disabled" : ""
      }`}
      onClick={() => !disabled && onChange(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      title={isDark ? "Theme: Dark" : "Theme: Light"}
    >
      <span className="neThemeTrack" aria-hidden="true">
        <span className="neThemeKnob" aria-hidden="true" />
      </span>

      <span className="neThemeIcon" aria-hidden="true">
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg className="neIcon16" viewBox="0 0 24 24" fill="none">
      <circle className="neStroke" cx="12" cy="12" r="4" />
      <path className="neStroke" d="M12 2v3" />
      <path className="neStroke" d="M12 19v3" />
      <path className="neStroke" d="M4.2 4.2l2.1 2.1" />
      <path className="neStroke" d="M17.7 17.7l2.1 2.1" />
      <path className="neStroke" d="M2 12h3" />
      <path className="neStroke" d="M19 12h3" />
      <path className="neStroke" d="M4.2 19.8l2.1-2.1" />
      <path className="neStroke" d="M17.7 6.3l2.1-2.1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="neIcon16" viewBox="0 0 24 24" fill="none">
      <path
        className="neStroke"
        d="M21 13.2A7.5 7.5 0 0 1 10.8 3a6.5 6.5 0 1 0 10.2 10.2Z"
      />
    </svg>
  );
}

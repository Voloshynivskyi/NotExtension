// popup/src/options/components/SettingsLayout.jsx
import React from "react";

export function SettingsLayout({
  title,
  subtitle,
  nav,
  activeKey,
  onNavigate,
  children,
  loading,
}) {
  let logoUrl = "";
  try {
    logoUrl = chrome?.runtime?.getURL?.("icons/icon-32.png") || "";
  } catch {
    logoUrl = "";
  }

  return (
    <div className="opt-root">
      <header className="opt-header">
        <div className="opt-brand">
          <div className="opt-brand-row">
            {logoUrl ? (
              <img className="opt-logo" src={logoUrl} alt="NotExtension" />
            ) : null}
            <div className="opt-title">
              {title} <span className="opt-subtitle">{subtitle}</span>
            </div>
          </div>
          <div className="opt-caption">
            {loading
              ? "Loading settings…"
              : "All changes are saved automatically."}
          </div>
        </div>
      </header>

      <div className="opt-shell">
        <aside className="opt-nav">
          {nav.map((item) => (
            <button
              key={item.key}
              className={`opt-nav-item ${item.key === activeKey ? "is-active" : ""}`}
              onClick={() => onNavigate(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </aside>

        <main className="opt-main">
          <div className="opt-page">{children}</div>
        </main>
      </div>
    </div>
  );
}

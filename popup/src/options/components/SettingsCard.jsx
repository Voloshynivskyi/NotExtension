// popup/src/options/components/SettingsCard.jsx
import React from "react";

export function SettingsCard({ title, description, children, right }) {
  return (
    <section className="opt-card">
      <div className="opt-card-head">
        <div>
          <div className="opt-card-title">{title}</div>
          {description ? (
            <div className="opt-card-desc">{description}</div>
          ) : null}
        </div>
        {right ? <div className="opt-card-right">{right}</div> : null}
      </div>

      <div className="opt-card-body">{children}</div>
    </section>
  );
}

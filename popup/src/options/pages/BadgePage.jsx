// popup/src/options/pages/BadgePage.jsx
import React from "react";
import { SettingsCard } from "../components/SettingsCard";
import { SettingsRow } from "../components/SettingsRow";
import { Toggle, TextInput, Button, Pill } from "../components/Controls";
import { normalizeOriginInput, getActiveTabOrigin } from "../utils/origin";

export function BadgePage({ settings }) {
  const [query, setQuery] = React.useState("");
  const [originInput, setOriginInput] = React.useState("");

  const disabled = settings.badgeDisabledOrigins || [];
  const filtered = disabled.filter((o) =>
    o.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function disableCurrentSite() {
    const origin = await getActiveTabOrigin();
    if (!origin) return;
    // If it isn't disabled now, then disable it (toggle).
    if (settings.isBadgeEnabledForOrigin(origin)) {
      settings.toggleBadgeForOrigin(origin);
    }
  }

  function disableFromInput() {
    const origin = normalizeOriginInput(originInput);
    if (!origin) return;
    if (settings.isBadgeEnabledForOrigin(origin)) {
      settings.toggleBadgeForOrigin(origin);
    }
    setOriginInput("");
  }

  return (
    <>
      <SettingsCard
        title="Badge"
        description="Controls the on-page badge. It appears only when enabled AND when a note exists."
        right={<Pill tone="blue">UI</Pill>}
      >
        <SettingsRow
          label="Enable badge globally"
          hint="Master switch. If disabled, the badge will never show on any website."
          control={
            <Toggle
              checked={settings.badgeGlobalEnabled}
              onChange={() => settings.setBadgeGlobalEnabled((v) => !v)}
            />
          }
        />

        <div className="opt-divider" />

        <div className="opt-inline">
          <Button
            variant="primary"
            onClick={disableCurrentSite}
            disabled={!settings.loaded || !settings.badgeGlobalEnabled}
            title="Disables badge for the currently active website"
          >
            Disable for current site
          </Button>

          <span className="opt-muted">
            Disabled sites: <b>{disabled.length}</b>
          </span>
        </div>

        <div className="opt-inline" style={{ marginTop: 10 }}>
          <TextInput
            value={originInput}
            onChange={setOriginInput}
            placeholder="example.com or https://example.com/..."
            disabled={!settings.loaded || !settings.badgeGlobalEnabled}
          />
          <Button
            onClick={disableFromInput}
            disabled={!settings.loaded || !settings.badgeGlobalEnabled}
          >
            Disable origin
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Disabled origins"
        description="Badge is turned off for these websites."
        right={<Pill tone="neutral">Per-site</Pill>}
      >
        <div className="opt-inline">
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder="Search…"
            disabled={!settings.loaded}
          />
          <Button
            variant="default"
            onClick={() => {
              setQuery("");
            }}
            disabled={!settings.loaded}
          >
            Clear
          </Button>
        </div>

        <div className="opt-list" style={{ marginTop: 10 }}>
          {filtered.length === 0 ? (
            <div className="opt-muted">No disabled origins.</div>
          ) : (
            filtered.map((origin) => (
              <div key={origin} className="opt-list-item">
                <div className="opt-list-item-main">
                  <div className="opt-mono">{origin}</div>
                  <div className="opt-muted">
                    Badge enabled here:{" "}
                    <b>
                      {settings.isBadgeEnabledForOrigin(origin) ? "Yes" : "No"}
                    </b>
                  </div>
                </div>

                <Button
                  variant="danger"
                  onClick={() => {
                    // If the origin is in disabled, the toggle will enable it.
                    settings.toggleBadgeForOrigin(origin);
                  }}
                  disabled={!settings.loaded}
                  title="Remove from disabled list"
                >
                  Enable
                </Button>
              </div>
            ))
          )}
        </div>
      </SettingsCard>
    </>
  );
}

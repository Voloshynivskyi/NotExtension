// popup/src/components/TopBar.jsx
import React from "react";
import {
  Settings,
  Save,
  Trash2,
  BadgeCheck,
  BadgeX,
  Zap,
  ZapOff,
  Sun,
  Moon,
} from "lucide-react";
import { IconButton } from "./IconButton";
import { StatusComponent } from "./StatusComponent";

function mapToUiState(statusKind, statusText) {
  if (statusKind === "loading") return "loading";
  if (statusKind === "saving") return "saving";
  if (statusKind === "deleting") return "deleting";
  if (statusKind === "error") return "error";

  const t = (statusText || "").toLowerCase();
  if (t === "unsaved") return "unsaved";
  if (t === "deleted") return "deleted";

  return "ready";
}

export function TopBar({
  origin,
  status,
  statusText,

  onSettings,
  onSave,
  onDelete,
  canSave,
  canDelete,

  autosaveEnabled,
  badgeEnabled,
  theme,

  onToggleAutosave,
  onToggleBadge,
  onToggleTheme,

  settingsLoaded = true,
}) {
  const uiState = mapToUiState(status?.kind, statusText);
  const isDark = theme === "dark";
  const togglesDisabled = !settingsLoaded;
  let logoUrl = "";
  try {
    logoUrl = chrome?.runtime?.getURL?.("icons/icon-32.png") || "";
  } catch {
    logoUrl = "";
  }

  return (
    <div
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--ne-border)",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        alignItems: "start",
        background: "var(--ne-bg)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 800,
            color: "var(--ne-fg)",
            lineHeight: 1.1,
            letterSpacing: "-0.2px",
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="NotExtension"
              width={18}
              height={18}
              style={{ borderRadius: 5, border: "1px solid var(--ne-border)" }}
            />
          ) : null}
          NotExtension
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "var(--ne-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={origin}
        >
          Site: <span style={{ color: "var(--ne-fg)" }}>{origin || "…"}</span>
        </div>

        <div style={{ marginTop: 6 }}>
          <StatusComponent state={uiState} label={statusText} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          justifyItems: "end",
          alignItems: "center",
          marginTop: 2,
        }}
      >
        {/* Badge */}
        <IconButton
          title={badgeEnabled ? "Badge: ON" : "Badge: OFF"}
          onClick={onToggleBadge}
          disabled={togglesDisabled}
          active={badgeEnabled}
          tone="blue"
          iconColor="var(--ne-muted)"
          activeIconColor="var(--ne-accent)"
        >
          {badgeEnabled ? <BadgeCheck size={16} /> : <BadgeX size={16} />}
        </IconButton>

        {/* Autosave */}
        <IconButton
          title={autosaveEnabled ? "Autosave: ON" : "Autosave: OFF"}
          onClick={onToggleAutosave}
          disabled={togglesDisabled}
          active={autosaveEnabled}
          tone="yellow"
          iconColor="var(--ne-muted)"
          activeIconColor="#f59e0b"
        >
          {autosaveEnabled ? <Zap size={16} /> : <ZapOff size={16} />}
        </IconButton>

        {/* Theme */}
        <IconButton
          title={isDark ? "Theme: Dark" : "Theme: Light"}
          onClick={onToggleTheme}
          disabled={togglesDisabled}
          active={isDark}
          tone="neutral"
          activeBg="var(--ne-surface-2)"
          activeBorderColor="var(--ne-border)"
          iconColor={isDark ? "#fbbf24" : "#f59e0b"}
          activeIconColor="#fbbf24"
        >
          {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>

        {/* Save / Delete / Settings */}
        <IconButton
          title="Save"
          onClick={onSave}
          disabled={!canSave}
          tone="neutral"
        >
          <Save size={16} />
        </IconButton>

        <IconButton
          title="Delete"
          onClick={onDelete}
          disabled={!canDelete}
          tone="neutral"
        >
          <Trash2 size={16} />
        </IconButton>

        <IconButton
          title="Settings"
          onClick={onSettings}
          disabled={false}
          tone="neutral"
        >
          <Settings size={16} />
        </IconButton>
      </div>
    </div>
  );
}

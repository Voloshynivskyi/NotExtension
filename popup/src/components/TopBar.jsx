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

  return (
    <div
      style={{
        padding: "8px 10px 8px 10px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#111",
            lineHeight: 1.1,
          }}
        >
          NotExtension
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: "#666",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={origin}
        >
          Site: <span style={{ color: "#111" }}>{origin || "…"}</span>
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
        <IconButton
          title={badgeEnabled ? "Badge: ON" : "Badge: OFF"}
          onClick={onToggleBadge}
          disabled={togglesDisabled}
          active={badgeEnabled}
          tone="blue"
          iconColor={badgeEnabled ? "#2563eb" : "#6b7280"}
        >
          {badgeEnabled ? <BadgeCheck size={16} /> : <BadgeX size={16} />}
        </IconButton>

        <IconButton
          title={autosaveEnabled ? "Autosave: ON" : "Autosave: OFF"}
          onClick={onToggleAutosave}
          disabled={togglesDisabled}
          active={autosaveEnabled}
          tone="yellow"
          iconColor={autosaveEnabled ? "#f59e0b" : "#6b7280"}
        >
          {autosaveEnabled ? <Zap size={16} /> : <ZapOff size={16} />}
        </IconButton>

        <IconButton
          title={isDark ? "Theme: Dark" : "Theme: Light"}
          onClick={onToggleTheme}
          disabled={togglesDisabled}
          active={isDark}
          tone={isDark ? "dark" : "neutral"}
          bg="transparent"
          activeBg="#111827"
          activeBorderColor="rgba(255,255,255,0.18)"
          iconColor={isDark ? "#fbbf24" : "#f59e0b"}
          activeIconColor="#fbbf24"
        >
          {isDark ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>

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

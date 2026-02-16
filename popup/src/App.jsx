import React from "react";
import { TopBar } from "./components/TopBar";
import { NoteEditor } from "./components/NoteEditor";
import { BottomResizeHandle } from "./components/BottomResizeHandle";
import { usePopupNote } from "./hooks/usePopupNote";
import { useBottomResize } from "./hooks/useBottomResize";
import { useSettings } from "./hooks/useSettings";

export default function App() {
  const settings = useSettings();
  const note = usePopupNote({ autosaveEnabled: settings.autosaveEnabled });
  const resize = useBottomResize({ initial: 200 });
  const badgeEnabledForSite = settings.isBadgeEnabledForOrigin(note.origin);

  React.useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  return (
    <div style={{ width: 360, boxSizing: "border-box" }}>
      <TopBar
        origin={note.origin}
        status={note.status}
        statusText={note.statusText}
        onSettings={note.handleOpenSettings}
        onSave={note.handleSave}
        onDelete={note.handleDelete}
        canSave={note.canSave}
        canDelete={note.canDelete}
        autosaveEnabled={settings.autosaveEnabled}
        badgeEnabled={badgeEnabledForSite}
        theme={settings.theme}
        onToggleAutosave={() => settings.setAutosaveEnabled((v) => !v)}
        onToggleBadge={() => settings.toggleBadgeForOrigin(note.origin)}
        onToggleTheme={() =>
          settings.setTheme((t) => (t === "dark" ? "light" : "dark"))
        }
        settingsLoaded={settings.loaded}
      />

      <NoteEditor
        value={note.noteText}
        onChange={note.setNoteText}
        disabled={note.editorDisabled}
        height={resize.height}
      />

      <BottomResizeHandle onMouseDown={resize.startResize} />
    </div>
  );
}

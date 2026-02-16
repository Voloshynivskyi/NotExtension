// popup/src/components/NoteEditor.jsx
import React from "react";
import "./NoteEditor.css";

export function NoteEditor({ value, onChange, disabled, height }) {
  return (
    <textarea
      className="neNoteEditor"
      placeholder="Write note for this site…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ height }}
    />
  );
}

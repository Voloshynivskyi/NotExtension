// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\components\NoteEditor.jsx
import React from "react";

export function NoteEditor({ value, onChange, disabled, height }) {
  return (
    <textarea
      placeholder="Write note for this site…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        width: "100%",
        height,
        boxSizing: "border-box",
        border: "none",
        outline: "none",
        padding: "10px 10px 22px 10px",
        fontSize: 14,
        lineHeight: 1.4,
        fontFamily: "inherit",
        resize: "none",
        background: "#fff",
      }}
    />
  );
}

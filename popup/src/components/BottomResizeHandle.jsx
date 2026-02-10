// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\components\BottomResizeHandle.jsx
import React from "react";

export function BottomResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title="Resize"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 12,
        display: "grid",
        placeItems: "center",
        cursor: "ns-resize",
        userSelect: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          width: 44,
          height: 5,
          borderRadius: 999,
          background: "rgba(0,0,0,0.20)",
        }}
      />
    </div>
  );
}

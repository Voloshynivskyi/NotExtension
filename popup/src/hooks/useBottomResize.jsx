// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\hooks\useBottomResize.jsx
import React from "react";

export function useBottomResize({ initial = 320, min = 200, max = 1200 } = {}) {
  const [height, setHeight] = React.useState(initial);

  const startResize = React.useCallback(
    (e) => {
      e.preventDefault();

      const startY = e.clientY;
      const startH = height;

      function onMove(ev) {
        const dy = ev.clientY - startY;
        const next = Math.min(max, Math.max(min, startH + dy));
        setHeight(next);
      }

      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [height, min, max],
  );

  return { height, setHeight, startResize };
}

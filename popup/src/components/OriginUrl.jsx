// C:\Users\ASUS ZenBook\Documents\Portfolio Projects\NotExtension\popup\src\components\OriginUrl.jsx
export function OriginUrl({ origin }) {
  return (
    <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
      Site: <span style={{ color: "#111" }}>{origin || "…"}</span>
    </div>
  );
}

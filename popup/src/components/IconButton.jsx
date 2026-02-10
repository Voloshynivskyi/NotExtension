// popup/src/components/IconButton.jsx
import React from "react";

const TONES = {
  neutral: {
    icon: "#111",
    hoverBg: "rgba(0,0,0,0.04)",
    activeBg: "rgba(0,0,0,0.06)",
    activeBorder: "rgba(0,0,0,0.16)",
  },
  blue: {
    icon: "#2563eb",
    hoverBg: "rgba(37,99,235,0.10)",
    activeBg: "rgba(37,99,235,0.14)",
    activeBorder: "rgba(37,99,235,0.35)",
  },
  yellow: {
    icon: "#f59e0b",
    hoverBg: "rgba(245,158,11,0.12)",
    activeBg: "rgba(245,158,11,0.16)",
    activeBorder: "rgba(245,158,11,0.40)",
  },
  danger: {
    icon: "#b42318",
    hoverBg: "rgba(239,68,68,0.10)",
    activeBg: "rgba(239,68,68,0.14)",
    activeBorder: "rgba(239,68,68,0.35)",
  },
  dark: {
    icon: "#e5e7eb",
    hoverBg: "rgba(17,24,39,0.90)",
    activeBg: "#111827",
    activeBorder: "rgba(255,255,255,0.18)",
  },
};

export function IconButton({
  title,
  onClick,
  disabled = false,
  children,

  active = false,
  tone = "neutral",
  size = 30,
  radius = 8,

  iconColor,
  activeIconColor,

  bg = "transparent",
  activeBg,
  borderColor = "rgba(0,0,0,0.10)",
  activeBorderColor,

  style,
}) {
  const [hover, setHover] = React.useState(false);

  const t = TONES[tone] ?? TONES.neutral;

  const resolvedBg = active ? (activeBg ?? t.activeBg) : bg;
  const resolvedBorder = active
    ? (activeBorderColor ?? t.activeBorder)
    : borderColor;

  const resolvedIcon = active
    ? (activeIconColor ?? iconColor ?? t.icon)
    : (iconColor ?? t.icon);

  const hoverBg = disabled
    ? resolvedBg
    : active
      ? resolvedBg
      : hover
        ? t.hoverBg
        : resolvedBg;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        borderRadius: radius,
        border: `1px solid ${resolvedBorder}`,
        background: hoverBg,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        color: resolvedIcon, // <- lucide icons read currentColor
        transition:
          "background 120ms ease, border-color 120ms ease, transform 80ms ease",
        ...style,
      }}
      onMouseDown={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = "translateY(0.5px)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
      }}
    >
      {children}
    </button>
  );
}

// popup/src/components/IconButton.jsx
import React from "react";

const TONES = {
  neutral: {
    icon: "var(--ne-fg)",
    hoverBg: "var(--ne-hover)",
    activeBg: "var(--ne-active)",
    activeBorder: "var(--ne-border)",
  },

  // IMPORTANT: tone "blue" у нас тепер = бренд-акцент (фіолетовий)
  blue: {
    icon: "var(--ne-accent)",
    hoverBg: "var(--ne-accent-soft)",
    activeBg: "var(--ne-accent-soft-hover)",
    activeBorder: "var(--ne-focus)",
  },

  yellow: {
    icon: "#f59e0b",
    hoverBg: "rgba(245,158,11,0.12)",
    activeBg: "rgba(245,158,11,0.16)",
    activeBorder: "rgba(245,158,11,0.40)",
  },

  danger: {
    icon: "var(--ne-danger)",
    hoverBg: "var(--ne-danger-soft)",
    activeBg: "var(--ne-danger-soft)",
    activeBorder: "rgba(230,77,77,0.45)",
  },

  dark: {
    icon: "var(--ne-fg)",
    hoverBg: "var(--ne-surface-2)",
    activeBg: "var(--ne-surface-2)",
    activeBorder: "var(--ne-border)",
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
  borderColor = "var(--ne-border)",
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
        color: resolvedIcon, // lucide icons read currentColor
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

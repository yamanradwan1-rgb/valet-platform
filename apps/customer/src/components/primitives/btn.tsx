import React from "react";

import { C } from "../../lib/theme/colors";

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = true,
  small = false,
  type = "button",
}: {
  readonly children: React.ReactNode;
  readonly onClick?: () => void;
  readonly variant?: "primary" | "secondary" | "ghost" | "danger";
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly small?: boolean;
  readonly type?: "button" | "submit" | "reset";
}) {
  const baseStyle: React.CSSProperties = {
    display: fullWidth ? "flex" : "inline-flex",
    width: fullWidth ? "100%" : "auto",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontWeight: 600,
    fontSize: small ? 14 : 15,
    padding: small ? "10px 16px" : "16px 20px",
    borderRadius: 10,
    minHeight: small ? 40 : 48,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.5 : 1,
    transition: "all 150ms ease",
    border: "none",
    outline: variant === "primary" || variant === "ghost" ? undefined : "none",
    userSelect: "none",
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: "var(--brand-button-fill, var(--brand-primary, var(--v-blue)))",
      boxShadow: "inset 0 0 0 1px var(--brand-boundary, transparent)",
      color: "var(--brand-on-primary, #FFFFFF)",
    },
    secondary: {
      backgroundColor: "transparent",
      border: `1px solid ${C.borderSemantic}`,
      color: C.text,
    },
    ghost: {
      backgroundColor: "transparent",
      color: C.accent,
    },
    danger: {
      backgroundColor: "transparent",
      color: C.dangerSemantic,
    },
  };

  return (
    <button
      className={variant === "primary" ? "guest-brand-primary" : variant === "ghost" ? "guest-brand-link" : undefined}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading}
      style={{ ...baseStyle, ...variantStyles[variant] }}
    >
      {loading ? (
        <>
          <span
            className="spin"
            aria-hidden="true"
            style={{
              width: 18,
              height: 18,
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              display: "block",
            }}
          />
          <span
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

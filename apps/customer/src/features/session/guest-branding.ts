import type { CSSProperties } from "react";

import type { GuestSafeSession } from "../../lib/api/guest-api-types";

export const DEFAULT_BRAND_PRIMARY = "#176BFF";

export function guestBrandDisplayName(
  session: GuestSafeSession,
): string | undefined {
  const name = session.branding?.displayName?.trim();
  return name && [...name].length <= 120 && !/\p{Cc}/u.test(name)
    ? name
    : undefined;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(left: string, right: string): number {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// These are the existing theme surfaces on which accent text is rendered.
// Unsafe runtime colors keep the established default rather than changing surfaces.
export function guestBrandStyle(
  session: GuestSafeSession | null,
  dark: boolean,
): CSSProperties {
  const candidate = session?.branding?.primaryColor;
  const surfaces = dark
    ? ["#07111F", "#0E223D", "#182E4B"]
    : ["#FAFAF8", "#EDF4FF", "#FFFFFF"];
  const safe =
    typeof candidate === "string" &&
    /^#[0-9A-F]{6}$/u.test(candidate) &&
    surfaces.every((surface) => contrast(candidate, surface) >= 4.5);
  const primary = safe ? candidate : DEFAULT_BRAND_PRIMARY;
  return {
    "--brand-primary": primary,
    "--v-blue": "var(--brand-primary)",
    "--v-blue-hover": "var(--brand-primary)",
    "--brand-on-primary":
      contrast(primary, "#FFFFFF") >= 4.5 ? "#FFFFFF" : "#07111F",
  } as CSSProperties;
}

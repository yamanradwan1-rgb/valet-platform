import type { CSSProperties } from "react";

import { guestBrandPalette } from "./guest-brand-palette";

import type { GuestSafeSession } from "../../lib/api/guest-api-types";

export function guestBrandDisplayName(
  session: GuestSafeSession,
): string | undefined {
  const name = session.branding?.displayName?.trim();
  return name && [...name].length <= 120 && !/\p{Cc}/u.test(name)
    ? name
    : undefined;
}

// Only canonical contract colors can enter CSS. Missing/invalid projection
// leaves the existing theme defaults in place; valid bright colors remain valid.
export function guestBrandStyle(
  session: GuestSafeSession | null,
  dark: boolean,
): CSSProperties {
  const candidate = session?.branding?.primaryColor;
  if (typeof candidate !== "string" || !/^#[0-9A-F]{6}$/u.test(candidate)) return {};
  const palette = guestBrandPalette(candidate, dark);
  return {
    "--brand-primary": palette.primary,
    "--brand-on-primary": palette.foreground,
    "--brand-hover": palette.hover,
    "--brand-pressed": palette.pressed,
    "--brand-focus": palette.accent,
    "--brand-boundary": palette.accent,
    "--brand-surface": palette.tint,
    "--v-blue": palette.accent,
    "--v-blue-hover": palette.accent,
  } as CSSProperties;
}

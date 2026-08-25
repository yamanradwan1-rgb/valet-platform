"use client";

import type { JSX } from "react";

export interface ScanHubLiveTileProps {
  readonly accentClass: string;
  readonly glyph: JSX.Element;
  /** Truthful localized label (tile name while enabled, reason while disabled). */
  readonly subtitle: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly onSelect?: (() => void) | undefined;
}

/**
 * One context-aware Scan Hub launcher tile (DEC-066 §5). A disabled tile is
 * a real non-interactive button that states its truthful localized reason;
 * it carries no onClick at all and never suggests a camera/scanner step.
 */
export function ScanHubLiveTile({
  accentClass,
  disabled,
  glyph,
  label,
  onSelect,
  subtitle,
}: ScanHubLiveTileProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`bg-white rounded-2xl border border-vborder p-4 text-start flex flex-col gap-3 min-h-[132px] transition-all ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:shadow-md active:scale-[0.97]"
      }`}
    >
      <span
        className={`w-11 h-11 rounded-xl ${accentClass} flex items-center justify-center flex-shrink-0`}
      >
        {glyph}
      </span>
      <span>
        <span className="block font-semibold text-navy text-sm leading-tight">
          {label}
        </span>
        <span className="block text-muted text-xs mt-1 leading-snug">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

"use client";

import type { ReactNode } from "react";

interface ListCardButtonProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  fields: ReadonlyArray<{ label: string; value: string }>;
  onClick: () => void;
}

/**
 * Button-based mobile list card sharing the exact `.mobile-data-row` visual
 * contract; the whole card opens the row's detail surface. Used instead of
 * extending the static MobileDataRow primitive so read-only rendering stays
 * untouched for other surfaces.
 */
export function ListCardButton({
  title,
  subtitle,
  trailing,
  fields,
  onClick,
}: ListCardButtonProps) {
  return (
    <button
      type="button"
      className="mobile-data-row is-clickable-card"
      onClick={onClick}
    >
      <span className="mobile-data-row-head">
        <span className="mobile-data-row-title-wrap">
          <span className="mobile-data-row-title">{title}</span>
          {subtitle !== undefined && (
            <span className="mobile-data-row-subtitle">{subtitle}</span>
          )}
        </span>
        {trailing}
      </span>
      <span className="mobile-data-fields">
        {fields.map((field) => (
          <span key={field.label} className="mobile-data-field">
            <span className="mobile-data-field-label">{field.label}</span>
            <span className="mobile-data-field-value">{field.value}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

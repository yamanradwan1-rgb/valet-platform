"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { useTranslation } from "../../i18n/locale-provider";

/**
 * D1 detail sheet for list surfaces: bottom sheet on small screens, floating
 * panel on the inline-end side from sm up. Closes on Escape or backdrop tap.
 * Direction-aware via logical CSS properties only.
 *
 * Initial focus moves inside the panel on mount (D5-001), mirroring the
 * accepted dashboard-overview DetailSheet pattern: without it, keyboard and
 * screen-reader users stay focused on the triggering row BEHIND the modal
 * while every editor field opens unfocused.
 */
export function ListDetailSheet(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { title, onClose, children } = props;
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="detail-backdrop"
        onClick={onClose}
        aria-label={t("common.close")}
        tabIndex={-1}
      />
      <div ref={panelRef} className="detail-sheet" tabIndex={-1}>
        <div className="detail-head">
          <h3 className="detail-title">{title}</h3>
          <button
            type="button"
            className="detail-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="detail-fields">{children}</div>
      </div>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value?: string;
  mono?: boolean;
  /** When provided it replaces the textual value (e.g. a status badge). */
  children?: ReactNode;
}

export function DetailField({
  label,
  value,
  mono,
  children,
}: DetailFieldProps) {
  return (
    <div className="detail-field">
      <p className="detail-field-label">{label}</p>
      {children !== undefined ? (
        <div className="detail-field-value">{children}</div>
      ) : (
        <p className={`detail-field-value${mono === true ? " is-mono" : ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}

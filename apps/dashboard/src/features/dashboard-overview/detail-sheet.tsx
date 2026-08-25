"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface DetailSheetProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * D1 read-only detail sheet: bottom sheet on mobile, side panel on desktop.
 * Closes via Escape, scrim click or the close button. Purely presentational;
 * it never hosts mutations.
 */
export function DetailSheet({
  title,
  closeLabel,
  onClose,
  children,
}: DetailSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="detail-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div aria-hidden="true" className="detail-sheet-scrim" onClick={onClose} />
      <div ref={panelRef} className="detail-sheet-panel" tabIndex={-1}>
        <div className="detail-sheet-head">
          <h2 className="detail-sheet-title">{title}</h2>
          <button
            type="button"
            className="detail-sheet-close"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <dl className="detail-fields">{children}</dl>
      </div>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  mono?: boolean | undefined;
  children: ReactNode;
}

export function DetailField({ label, mono, children }: DetailFieldProps) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd className={mono === true ? "is-mono" : undefined}>{children}</dd>
    </div>
  );
}

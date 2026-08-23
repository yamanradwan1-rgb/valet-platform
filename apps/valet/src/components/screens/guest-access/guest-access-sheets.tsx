"use client";

import { useEffect, useRef, type JSX } from "react";

import { Btn } from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";

/**
 * Accessible mobile bottom-sheet confirmation used for the destructive
 * reissue/revoke confirmations. Focuses the sheet on open and closes on
 * backdrop activation.
 */
export function ConfirmSheet({
  body,
  cancelLabel,
  confirmLabel,
  isOpen,
  onClose,
  onConfirm,
  title,
  variant,
}: {
  readonly body: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly variant: "danger" | "primary";
}): JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { t } = useEmployeeI18n();

  useEffect(() => {
    if (isOpen) sheetRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <button
        aria-label={t.back}
        className="absolute inset-0 bg-navy/60 cursor-default"
        onClick={onClose}
        type="button"
      />
      <div
        aria-modal="true"
        className="relative w-full bg-white rounded-t-3xl p-5 space-y-4 border-t border-vborder"
        ref={sheetRef}
        role="dialog"
        aria-label={title}
        tabIndex={-1}
      >
        <p className="font-heading font-bold text-lg text-navy">{title}</p>
        <p className="text-neutral text-sm">{body}</p>
        <Btn label={confirmLabel} onClick={onConfirm} variant={variant === "danger" ? "danger" : "primary"} />
        <Btn label={cancelLabel} onClick={onClose} size="md" variant="secondary" />
      </div>
    </div>
  );
}

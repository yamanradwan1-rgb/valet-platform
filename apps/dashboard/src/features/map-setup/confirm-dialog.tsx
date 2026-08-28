"use client";

import { useRef } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { ModalPortal } from "../../components/ui/modal-portal";
import { useModalA11y } from "../../components/ui/use-modal-a11y";

interface ConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Explicit confirmation interaction for destructive or destructive-like map
 * setup actions (deactivation, full vertex replacement). Nothing destructive
 * happens without this dialog being confirmed.
 */
export function ConfirmDialog({
  title,
  body,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  // Initial focus on the NON-destructive action, matching the accepted
  // mount-effect focus pattern of the overview detail sheet: keyboard users
  // start inside the dialog, one Tab reaches the destructive confirmation,
  // and focus never sits behind the open dialog.
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  useModalA11y(panelRef, onCancel, cancelButtonRef);

  return (
    <ModalPortal>
    <div
      className="detail-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="detail-backdrop"
        onClick={onCancel}
        tabIndex={-1}
        aria-label={t("common.close")}
      />
      <div className="map-setup-confirm-panel" ref={panelRef} tabIndex={-1}>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="map-setup-form-actions">
          <button
            type="button"
            ref={cancelButtonRef}
            className="btn-secondary"
            onClick={onCancel}
          >
            {t("mapSetup.action.cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t("mapSetup.editor.saving") : t("mapSetup.confirm.confirm")}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

"use client";

import { useRef } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { ModalPortal } from "../../components/ui/modal-portal";
import { useModalA11y } from "../../components/ui/use-modal-a11y";
import "./location-settings-editor.css";

interface ClearOverrideDialogProps {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly settingLabel: string;
}

/**
 * Explicit confirmation before clearing a location override. Clearing is an
 * explicit backend operation and reverting to the company default changes the
 * applied behavior, so it never happens without this dialog.
 */
export function ClearOverrideDialog({
  busy,
  onCancel,
  onConfirm,
  settingLabel,
}: ClearOverrideDialogProps) {
  const { t } = useTranslation();
  // Initial focus on the NON-destructive action (Cancel), matching the
  // accepted mount-effect focus pattern of the map-setup ConfirmDialog:
  // keyboard users start inside the dialog and focus never sits behind it.
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  useModalA11y(panelRef, onCancel, cancelButtonRef);

  return (
    <ModalPortal>
    <div
      className="detail-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label={t("config.clear.title")}
    >
      <button
        type="button"
        className="detail-backdrop"
        onClick={onCancel}
        tabIndex={-1}
        aria-label={t("config.actions.cancel")}
      />
      <div className="config-editor-panel is-compact" ref={panelRef} tabIndex={-1}>
        <h3>{t("config.clear.title")}</h3>
        <p>
          {settingLabel} — {t("config.clear.body")}
        </p>
        <div className="map-setup-form-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onCancel}
            ref={cancelButtonRef}
          >
            {t("config.actions.cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t("config.editor.saving") : t("config.clear.confirm")}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

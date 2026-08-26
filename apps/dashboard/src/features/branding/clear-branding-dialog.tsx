"use client";

import { useEffect, useRef } from "react";

import { useTranslation } from "../../i18n/locale-provider";

interface ClearBrandingDialogProps {
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly settingLabel: string;
}

/**
 * Explicit confirmation before clearing a location branding override.
 * Clearing is an explicit backend operation and reverting to the company
 * default changes the applied branding, so it never happens without this
 * dialog. Initial focus sits on the NON-destructive action (Cancel),
 * matching the accepted mount-effect focus pattern of the reviewed Location
 * Settings / map-setup dialogs; Escape cancels.
 */
export function ClearBrandingDialog({
  busy,
  onCancel,
  onConfirm,
  settingLabel,
}: ClearBrandingDialogProps) {
  const { t } = useTranslation();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      aria-label={t("branding.clear.title")}
      aria-modal="true"
      className="detail-overlay"
      role="alertdialog"
    >
      <button
        aria-label={t("branding.actions.cancel")}
        className="detail-backdrop"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div className="branding-editor-panel is-compact">
        <h3>{t("branding.clear.title")}</h3>
        <p>
          {settingLabel} — {t("branding.clear.body")}
        </p>
        <div className="map-setup-form-actions">
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            {t("branding.actions.cancel")}
          </button>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? t("branding.editor.saving") : t("branding.clear.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

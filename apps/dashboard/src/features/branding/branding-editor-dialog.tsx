"use client";

import { useEffect, useRef, useState } from "react";
import type { BrandingSetting } from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import { brandingSettingLabelKey } from "./branding-labels";
import {
  COLOR_INPUT_PATTERN,
  type BrandingProjection,
  parseBrandingInput,
} from "./branding-state";

interface BrandingEditorDialogProps {
  readonly onClose: () => void;
  /** Receives the validated contract value; the view owns dispatching. */
  readonly onSave: (value: string) => void;
  readonly pending: boolean;
  readonly projection: BrandingProjection;
  readonly setting: BrandingSetting;
}

/**
 * Dialog for setting/updating ONE location branding override (D4-004).
 *
 * - Display name: a labeled text field. The submitted value is trimmed and
 *   validated against the exact contract rules (1–120 Unicode code points,
 *   no control characters) BEFORE dispatch; nothing invalid is ever sent.
 * - Primary color: a labeled hex text field plus a native color picker whose
 *   output is deliberately normalized to UPPERCASE (the backend accepts
 *   uppercase only). The exact effective/draft hex string is always visible
 *   as text next to a decorative swatch.
 *
 * A11y baseline mirrors the reviewed Location Settings editor sheet:
 * role="dialog" + aria-modal + aria-label, backdrop click closes, Escape
 * closes, opening moves keyboard focus INSIDE the dialog (first field, else
 * Cancel), validation errors render in a conditional role="alert" paragraph,
 * Save stays disabled while a mutation is pending.
 */
export function BrandingEditorDialog({
  onClose,
  onSave,
  pending,
  projection,
  setting,
}: BrandingEditorDialogProps) {
  const { t } = useTranslation();
  const initial =
    projection.override !== null ? projection.override : projection.effective;

  const [draft, setDraft] = useState<string>(initial);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const field = panelRef.current?.querySelector<HTMLElement>(
      "input, select",
    );
    (field ?? cancelButtonRef.current)?.focus();
  }, []);

  function submit(): void {
    const outcome = parseBrandingInput(setting, draft);
    if (!outcome.ok) {
      setErrorKey(outcome.reasonKey);
      return;
    }
    setErrorKey(null);
    onSave(outcome.value);
  }

  const titleKey = projection.overridePresent
    ? "branding.editor.titleEdit"
    : "branding.editor.titleSet";
  const isColor = setting === "brandPrimaryColor";
  // The native color input requires an in-spec value at all times; fall back
  // to the authoritative effective color while the free-text draft is not a
  // valid uppercase hex.
  const pickerValue = COLOR_INPUT_PATTERN.test(draft)
    ? draft
    : projection.effective;
  const showDraftSwatch = COLOR_INPUT_PATTERN.test(draft);

  return (
    <div
      aria-label={t(titleKey)}
      aria-modal="true"
      className="detail-overlay"
      role="dialog"
    >
      <button
        aria-label={t("branding.actions.cancel")}
        className="detail-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="branding-editor-panel" ref={panelRef}>
        <h3>{t(titleKey)}</h3>
        <p className="branding-editor-subtitle">
          {t(brandingSettingLabelKey(setting))} —{" "}
          {t("branding.editor.subtitle")}
        </p>

        <dl className="branding-editor-facts">
          <div>
            <dt>{t("branding.editor.companyDefault")}</dt>
            <dd>
              {isColor ? (
                <>
                  <span
                    aria-hidden="true"
                    className="branding-swatch"
                    style={{
                      backgroundColor: COLOR_INPUT_PATTERN.test(
                        projection.default,
                      )
                        ? projection.default
                        : "transparent",
                    }}
                  />
                  <bdi className="branding-mono" dir="ltr">
                    {projection.default}
                  </bdi>
                </>
              ) : (
                projection.default
              )}
            </dd>
          </div>
          <div>
            <dt>{t("branding.editor.currentOverride")}</dt>
            <dd>
              {projection.overridePresent && projection.override !== null ? (
                isColor ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="branding-swatch"
                      style={{ backgroundColor: projection.override }}
                    />
                    <bdi className="branding-mono" dir="ltr">
                      {projection.override}
                    </bdi>
                  </>
                ) : (
                  projection.override
                )
              ) : (
                t("branding.override.absent")
              )}
            </dd>
          </div>
        </dl>

        <div className="form-field">
          <label htmlFor="branding-editor-input">
            {t("branding.editor.newValue")}
          </label>
          {isColor ? (
            <div className="branding-color-row">
              <input
                autoComplete="off"
                className="form-input"
                disabled={pending}
                id="branding-editor-input"
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
                type="text"
                value={draft}
              />
              <input
                aria-label={t("branding.editor.pickerLabel")}
                className="branding-color-picker"
                disabled={pending}
                id="branding-color-picker"
                onChange={(event) =>
                  setDraft(event.target.value.toUpperCase())
                }
                type="color"
                value={pickerValue.toLowerCase()}
              />
            </div>
          ) : (
            <input
              autoComplete="off"
              className="form-input"
              disabled={pending}
              id="branding-editor-input"
              onChange={(event) => setDraft(event.target.value)}
              type="text"
              value={draft}
            />
          )}
          {isColor && (
            <p className="branding-field-hint">
              <span
                aria-hidden="true"
                className="branding-swatch"
                style={{
                  backgroundColor: showDraftSwatch ? draft : "transparent",
                }}
              />
              {showDraftSwatch && (
                <bdi className="branding-mono" dir="ltr">
                  {draft}
                </bdi>
              )}{" "}
              {t("branding.hint.color")}
            </p>
          )}
          {!isColor && (
            <p className="branding-field-hint">{t("branding.hint.name")}</p>
          )}
        </div>

        {errorKey !== null && (
          <p className="form-error" role="alert">
            {t(errorKey)}
          </p>
        )}

        <div className="map-setup-form-actions">
          <button
            className="btn-secondary"
            disabled={pending}
            onClick={onClose}
            ref={cancelButtonRef}
            type="button"
          >
            {t("branding.actions.cancel")}
          </button>
          <button
            className="btn-primary"
            disabled={pending}
            onClick={submit}
            type="button"
          >
            {pending ? t("branding.editor.saving") : t("branding.editor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

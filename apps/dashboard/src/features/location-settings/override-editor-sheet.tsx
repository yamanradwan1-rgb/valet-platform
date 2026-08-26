"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ConfigurationSettingProjection,
  ConfigurationSettingKey,
} from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";
import {
  enumOptions,
  settingDisplayText,
  settingLabelKey,
  settingValueDisplay,
  type ConfiguredValue,
  type EnumPolicySetting,
} from "./configuration-labels";
import { parseSettingInput } from "./configuration-state";
import "./location-settings-editor.css";

interface OverrideEditorSheetProps {
  readonly currency: string;
  readonly onClose: () => void;
  /** Receives the validated contract value; the view owns dispatching. */
  readonly onSave: (value: ConfiguredValue) => void;
  readonly pending: boolean;
  readonly projection: ConfigurationSettingProjection;
}

const ENUM_SETTINGS: ReadonlySet<ConfigurationSettingKey> = new Set<
  EnumPolicySetting
>(["handoffStandardMethodPolicy", "paymentMethodsPolicy", "paymentServicePayer"]);

const BOOLEAN_SETTINGS: ReadonlySet<ConfigurationSettingKey> = new Set([
  "checkInPhotosRequired",
  "trackingEnabled",
  "tipsEnabled",
  "validationEnabled",
  "releaseRequiresPayment",
] as const);

/**
 * Sheet for setting/updating ONE location override. The draft starts from the
 * current authoritative value; saving is only possible with a contract-valid
 * value for that exact setting (money keeps its exact decimal text).
 */
export function OverrideEditorSheet({
  currency,
  onClose,
  onSave,
  pending,
  projection,
}: OverrideEditorSheetProps) {
  const { t } = useTranslation();
  const initial: ConfiguredValue =
    projection.override !== null ? projection.override : projection.effective;

  const [draft, setDraft] = useState<ConfiguredValue>(initial);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  // Accepted dialog baseline (map-setup ConfirmDialog / overview detail
  // sheet): opening the sheet moves keyboard focus INSIDE the dialog — the
  // actual editor field when one exists (select/number/fee branches), the
  // non-destructive Cancel button otherwise (boolean toggles render no
  // labelable field). Escape handling and the accessible name stay
  // unchanged; no focus trap is introduced here.
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
    const outcome = parseSettingInput(projection.setting, draft);
    if (!outcome.ok) {
      setErrorKey(outcome.reasonKey);
      return;
    }
    setErrorKey(null);
    onSave(outcome.value);
  }

  const titleKey = projection.overridePresent
    ? "config.editor.titleEdit"
    : "config.editor.titleSet";

  const factValue = (value: ConfiguredValue): string =>
    settingDisplayText(settingValueDisplay(projection.setting, value, currency), t);

  return (
    <div
      className="detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey)}
    >
      <button
        type="button"
        className="detail-backdrop"
        onClick={onClose}
        tabIndex={-1}
        aria-label={t("config.actions.cancel")}
      />
      <div className="config-editor-panel" ref={panelRef}>
        <h3>{t(titleKey)}</h3>
        <p className="config-editor-subtitle">
          {t(settingLabelKey(projection.setting))} — {t("config.editor.subtitle")}
        </p>

        <dl className="config-editor-facts">
          <div>
            <dt>{t("config.editor.companyDefault")}</dt>
            <dd>{factValue(projection.default)}</dd>
          </div>
          <div>
            <dt>{t("config.editor.currentOverride")}</dt>
            <dd>
              {projection.overridePresent && projection.override !== null
                ? factValue(projection.override)
                : t("config.override.absent")}
            </dd>
          </div>
        </dl>

        <div className="form-field">
          {BOOLEAN_SETTINGS.has(projection.setting) ? (
            // Boolean mode renders NO labelable control, so the field text
            // must not point at an id nothing owns: it becomes neutral text
            // that NAMES the toggle group below (role="group" +
            // aria-labelledby). No fake hidden input is created for it.
            <span
              id="config-editor-value-label"
              className="config-editor-value-label"
            >
              {t("config.editor.newValue")}
            </span>
          ) : (
            <label htmlFor="config-editor-input">
              {t("config.editor.newValue")}
            </label>
          )}
          {BOOLEAN_SETTINGS.has(projection.setting) ? (
            <div
              className="config-toggle-row"
              role="group"
              aria-labelledby="config-editor-value-label"
            >
              <button
                type="button"
                className="config-toggle"
                aria-pressed={draft === true}
                disabled={pending}
                onClick={() => setDraft(true)}
              >
                {t("enum.config.boolean.ON")}
              </button>
              <button
                type="button"
                className="config-toggle"
                aria-pressed={draft === false}
                disabled={pending}
                onClick={() => setDraft(false)}
              >
                {t("enum.config.boolean.OFF")}
              </button>
            </div>
          ) : ENUM_SETTINGS.has(projection.setting) ? (
            <select
              id="config-editor-input"
              className="form-input"
              value={String(draft)}
              disabled={pending}
              onChange={(event) => setDraft(event.target.value)}
            >
              {enumOptions(projection.setting as EnumPolicySetting).map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ),
              )}
            </select>
          ) : projection.setting === "rawGpsRetentionDays" ? (
            <input
              id="config-editor-input"
              className="form-input"
              inputMode="numeric"
              min={1}
              step={1}
              type="number"
              disabled={pending}
              value={String(draft)}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <div className="config-fee-row">
              <span className="config-currency-chip" aria-hidden="true">
                {currency}
              </span>
              <input
                id="config-editor-input"
                className="form-input"
                inputMode="decimal"
                autoComplete="off"
                disabled={pending}
                value={String(draft)}
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
          )}
          {projection.setting === "rawGpsRetentionDays" && (
            <p className="config-field-hint">{t("config.hint.retention")}</p>
          )}
          {projection.setting === "valetServiceFee" && (
            <p className="config-field-hint">{t("config.hint.fee")}</p>
          )}
        </div>

        {errorKey !== null && (
          <p className="form-error" role="alert">
            {t(errorKey)}
          </p>
        )}

        <div className="map-setup-form-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={onClose}
            ref={cancelButtonRef}
          >
            {t("config.actions.cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={submit}
          >
            {pending ? t("config.editor.saving") : t("config.editor.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

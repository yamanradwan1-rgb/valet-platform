"use client";

import { useId } from "react";
import type { ConfigurationSettingProjection } from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";
import {
  settingDescriptionKey,
  settingDisplayText,
  settingLabelKey,
  settingValueDisplay,
  type ConfiguredValue,
} from "./configuration-labels";

interface SettingRowProps {
  readonly currency: string;
  /** Disables actions while any mutation is in flight. */
  readonly disabled: boolean;
  readonly onClear: () => void;
  readonly onSetOrEdit: () => void;
  readonly projection: ConfigurationSettingProjection;
}

/**
 * One typed setting row presenting the four backend-provided facts side by
 * side: company default (read-only), whether an override is present, the
 * override value and the effective/applied value exactly as returned by the
 * backend. Nothing here recomputes precedence.
 */
export function SettingRow({
  currency,
  disabled,
  onClear,
  onSetOrEdit,
  projection,
}: SettingRowProps) {
  const { t } = useTranslation();
  const headingId = useId();

  const renderValue = (value: ConfiguredValue): string =>
    settingDisplayText(
      settingValueDisplay(projection.setting, value, currency),
      t,
    );

  return (
    <article
      className="config-row"
      aria-labelledby={headingId}
      data-testid={`config-row-${projection.setting}`}
    >
      <div className="config-row-name">
        <h3 id={headingId}>{t(settingLabelKey(projection.setting))}</h3>
        <p>{t(settingDescriptionKey(projection.setting))}</p>
        {projection.setting === "paymentMethodsPolicy" && (
          <p className="config-row-hint">{t("config.note.digitalOnly")}</p>
        )}
      </div>
      <div className="config-row-cell">
        <span className="config-cell-label">
          {t("config.columns.companyDefault")}
        </span>
        <span className="config-value">{renderValue(projection.default)}</span>
        <span className="config-readonly-tag">
          {t("config.default.readOnly")}
        </span>
      </div>
      <div className="config-row-cell" data-testid="config-row-override">
        <span className="config-cell-label">
          {t("config.columns.locationOverride")}
        </span>
        {projection.overridePresent && projection.override !== null ? (
          <>
            <span className="config-value is-override">
              {renderValue(projection.override)}
            </span>
            <span className="config-present-tag">✓</span>
          </>
        ) : (
          <span className="config-absent">
            {t("config.override.absent")}
          </span>
        )}
      </div>
      <div className="config-row-cell">
        <span className="config-cell-label">{t("config.columns.applied")}</span>
        <strong className="config-applied">
          {renderValue(projection.effective)}
        </strong>
      </div>
      <div className="config-row-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={onSetOrEdit}
        >
          {projection.overridePresent
            ? t("config.actions.editOverride")
            : t("config.actions.setOverride")}
        </button>
        {projection.overridePresent && (
          <button
            type="button"
            className="config-clear-button"
            disabled={disabled}
            onClick={onClear}
          >
            {t("config.actions.clearOverride")}
          </button>
        )}
      </div>
    </article>
  );
}

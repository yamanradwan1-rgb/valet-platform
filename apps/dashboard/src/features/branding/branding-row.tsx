"use client";

import { useId } from "react";
import type { BrandingSetting } from "@valet/contracts";

import { useTranslation } from "../../i18n/locale-provider";
import {
  brandingSettingDescriptionKey,
  brandingSettingLabelKey,
} from "./branding-labels";
import {
  COLOR_INPUT_PATTERN,
  type BrandingProjection,
} from "./branding-state";

interface BrandingRowProps {
  /** Disables actions while any mutation is in flight or conflict shown. */
  readonly disabled: boolean;
  readonly onClear: () => void;
  readonly onSetOrEdit: () => void;
  readonly projection: BrandingProjection;
  readonly setting: BrandingSetting;
}

/**
 * One branding setting row presenting the four backend-provided facts side
 * by side: company default (read-only), whether an override is present, the
 * override value and the effective/applied value exactly as returned by the
 * backend. Nothing here recomputes precedence.
 *
 * The primary color is always rendered as TEXT (the exact hex string) plus a
 * decorative swatch — the swatch alone is never the only carrier of the
 * value.
 */
export function BrandingRow({
  disabled,
  onClear,
  onSetOrEdit,
  projection,
  setting,
}: BrandingRowProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const isColor = setting === "brandPrimaryColor";

  const renderValue = (value: string, extraClass?: string) =>
    isColor ? (
      <span className={extraClass}>
        <span
          aria-hidden="true"
          className="branding-swatch"
          style={{
            backgroundColor: COLOR_INPUT_PATTERN.test(value) ? value : "transparent",
          }}
        />
        <bdi className="branding-mono" dir="ltr">
          {value}
        </bdi>
      </span>
    ) : (
      <span className={extraClass}>{value}</span>
    );

  return (
    <article
      aria-labelledby={headingId}
      className="branding-row"
      data-testid={`branding-row-${setting}`}
    >
      <div className="branding-row-name">
        <h3 id={headingId}>{t(brandingSettingLabelKey(setting))}</h3>
        <p>{t(brandingSettingDescriptionKey(setting))}</p>
      </div>
      <div className="branding-row-cell">
        <span className="branding-cell-label">
          {t("branding.columns.companyDefault")}
        </span>
        {renderValue(projection.default, "branding-value")}
        <span className="branding-readonly-tag">
          {t("branding.default.readOnly")}
        </span>
      </div>
      <div className="branding-row-cell" data-testid="branding-row-override">
        <span className="branding-cell-label">
          {t("branding.columns.locationOverride")}
        </span>
        {projection.overridePresent && projection.override !== null ? (
          <>
            {renderValue(projection.override, "branding-value is-override")}
            <span aria-hidden="true" className="branding-present-tag">✓</span>
          </>
        ) : (
          <span className="branding-absent">
            {t("branding.override.absent")}
          </span>
        )}
      </div>
      <div className="branding-row-cell">
        <span className="branding-cell-label">
          {t("branding.columns.applied")}
        </span>
        <strong className="branding-applied">
          {renderValue(projection.effective)}
        </strong>
      </div>
      <div className="branding-row-actions">
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={onSetOrEdit}
        >
          {projection.overridePresent
            ? t("branding.actions.editOverride")
            : t("branding.actions.setOverride")}
        </button>
        {projection.overridePresent && (
          <button
            type="button"
            className="branding-clear-button"
            disabled={disabled}
            onClick={onClear}
          >
            {t("branding.actions.clearOverride")}
          </button>
        )}
      </div>
    </article>
  );
}

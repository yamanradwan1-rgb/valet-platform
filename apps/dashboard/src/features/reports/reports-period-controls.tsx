"use client";

import type { ReportKind } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslationKey } from "../../i18n/translations/types";

import {
  draftValueForKind,
  validateReportPeriodInput,
  type ReportPeriodDrafts,
  type ReportPeriodErrorKind,
} from "./reports-period";

/**
 * Report request controls: kind radio group, per-kind period input with a
 * real label and linked hint, inline validation, and the Load action.
 *
 * A11y contract (auditor D): native radios inside a fieldset/legend are
 * keyboard-navigable and announced; every date/month input is wrapped in a
 * real <label>; hints/errors are linked via aria-describedby; validation
 * errors announce via role="alert". Raw backend enums never render — kinds
 * resolve through typed translation keys.
 */

export const REPORT_KINDS: readonly ReportKind[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

export const KIND_LABEL_KEYS: Record<ReportKind, TranslationKey> = {
  DAILY: "reports.kind.DAILY",
  MONTHLY: "reports.kind.MONTHLY",
  WEEKLY: "reports.kind.WEEKLY",
};

const HINT_KEYS: Record<ReportKind, TranslationKey> = {
  DAILY: "reports.period.hintDaily",
  MONTHLY: "reports.period.hintMonthly",
  WEEKLY: "reports.period.hintWeekly",
};

function periodErrorKey(
  error: ReportPeriodErrorKind,
): TranslationKey {
  switch (error) {
    case "dateFormat":
      return "reports.period.errorDate";
    case "monthFormat":
      return "reports.period.errorMonthFormat";
    case "weekFormat":
      return "reports.period.errorWeekFormat";
    case "weekMonday":
      return "reports.period.errorWeekMonday";
  }
}

export function ReportsPeriodControls({
  kind,
  drafts,
  appliedKind,
  appliedValue,
  maxDate,
  onKindChange,
  onDraftChange,
  onLoad,
}: {
  kind: ReportKind;
  drafts: ReportPeriodDrafts;
  appliedKind: ReportKind;
  appliedValue: string;
  maxDate: string;
  onKindChange: (kind: ReportKind) => void;
  onDraftChange: (drafts: ReportPeriodDrafts) => void;
  onLoad: () => void;
}) {
  const { t } = useTranslation();
  const value = draftValueForKind(drafts, kind);
  const validationError = validateReportPeriodInput(kind, value);
  const unchanged = kind === appliedKind && value === appliedValue;
  const hintId = `rep-period-hint-${kind.toLowerCase()}`;
  const errorId = `rep-period-error-${kind.toLowerCase()}`;

  return (
    <Card className="rep-period-card">
      <fieldset className="rep-kind-group">
        <legend className="rep-kind-legend">{t("reports.kind.groupLabel")}</legend>
        <div className="rep-kind-options">
          {REPORT_KINDS.map((option) => (
            <label className="rep-kind-option" key={option}>
              <input
                checked={kind === option}
                name="report-kind"
                onChange={() => onKindChange(option)}
                type="radio"
                value={option}
              />
              <span>{t(KIND_LABEL_KEYS[option])}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "MONTHLY" ? (
        <label className="rep-date-field">
          <span>{t("reports.period.monthLabel")}</span>
          <input
            aria-describedby={
              validationError !== null
                ? `${hintId} ${errorId}`
                : hintId
            }
            max="9999-12"
            onChange={(event) =>
              onDraftChange({ ...drafts, month: event.target.value })
            }
            type="month"
            value={value}
          />
        </label>
      ) : (
        <label className="rep-date-field">
          <span>
            {kind === "DAILY"
              ? t("reports.period.dateLabel")
              : t("reports.period.weekStartLabel")}
          </span>
          <input
            aria-describedby={
              validationError !== null
                ? `${hintId} ${errorId}`
                : hintId
            }
            max={maxDate}
            onChange={(event) =>
              onDraftChange(
                kind === "DAILY"
                  ? { ...drafts, date: event.target.value }
                  : { ...drafts, weekStart: event.target.value },
              )
            }
            type="date"
            value={value}
          />
        </label>
      )}

      <button
        className="btn-secondary rep-load-button"
        disabled={validationError !== null || unchanged}
        onClick={onLoad}
        type="button"
      >
        {t("reports.action.load")}
      </button>

      <div className="rep-period-meta">
        <p className="rep-hint" id={hintId}>
          {t(HINT_KEYS[kind])}
        </p>
        {validationError !== null ? (
          <p className="rep-error" id={errorId} role="alert">
            {t(periodErrorKey(validationError))}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

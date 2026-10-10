import { AlertTriangle, Car, Clock, Users } from "lucide-react";

import type { DashboardLocale } from "../../lib/i18n/locale";
import type { AnalyticsPeriodValidation } from "./intelligence-period-validation";
import { formatOverviewDuration } from "./overview-duration";
import { overviewCopy } from "./overview-copy";
import { OverviewMetricCard } from "./overview-page-ui";
import type { OverviewPeriodPresentation } from "./overview-presentation";
import styles from "./overview.module.css";

function count(value: number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-US").format(value);
}

function percentage(value: string, locale: DashboardLocale): string {
  if (locale === "en") return `${value}%`;
  const fractionDigits = value.split(".")[1]?.length ?? 0;
  return new Intl.NumberFormat("ar-JO", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value) / 100);
}

function fallbackContext(
  validation: AnalyticsPeriodValidation,
  loading: boolean,
  error: unknown,
  t: ReturnType<typeof overviewCopy>,
): string {
  if (validation.kind === "required") return t.selectPeriod;
  if (validation.kind !== "valid") return t.invalidPeriodShort;
  if (loading) return t.loading;
  if (error) return t.unavailable;
  return t.unavailable;
}

function slaContext(
  sla: OverviewPeriodPresentation["slaCompliance"],
  t: ReturnType<typeof overviewCopy>,
  locale: DashboardLocale,
): string {
  const hasGaps = sla.missingTargetCount > 0 || sla.invalidOrMissingIntervalCount > 0;
  const parts = [`${count(sla.numerator, locale)}/${count(sla.denominator, locale)}${hasGaps ? "" : ` ${t.measured}`}`];
  if (sla.missingTargetCount > 0) {
    parts.push(`${count(sla.missingTargetCount, locale)} ${t.missingTargetsShort}`);
  }
  if (sla.invalidOrMissingIntervalCount > 0) {
    parts.push(`${count(sla.invalidOrMissingIntervalCount, locale)} ${t.invalidIntervalsShort}`);
  }
  return parts.join(" · ");
}

export function OverviewMetrics(props: {
  readonly error: unknown;
  readonly loading: boolean;
  readonly locale: DashboardLocale;
  readonly presentation: OverviewPeriodPresentation | null;
  readonly validation: AnalyticsPeriodValidation;
}) {
  const t = overviewCopy(props.locale);
  const data = props.presentation;
  const fallback = fallbackContext(props.validation, props.loading, props.error, t);
  return (
    <div className={styles.metricGrid}>
      <OverviewMetricCard
        available={data !== null}
        context={data ? `${count(data.activeEmployeeCount, props.locale)} ${t.activeEmployees}` : fallback}
        helpKey="overview.metrics"
        icon={<Car size={20} />}
        label={t.carsHandled}
        tone={data ? "positive" : "info"}
        value={data ? count(data.carsHandled, props.locale) : t.unavailable}
      />
      <OverviewMetricCard
        available={data?.slaCompliance.percentage !== null && data !== null}
        context={data ? slaContext(data.slaCompliance, t, props.locale) : fallback}
        icon={<Users size={20} />}
        label={t.slaCompliance}
        tone={data?.slaCompliance.percentage != null ? "positive" : "info"}
        value={data?.slaCompliance.percentage == null
          ? t.unavailable : percentage(data.slaCompliance.percentage, props.locale)}
        valueDirection={props.locale === "ar" ? "rtl" : "ltr"}
      />
      <OverviewMetricCard
        available={data?.retrievalWaitAverageSeconds !== null && data !== null}
        context={data ? `${count(data.retrievalWaitSampleCount, props.locale)} ${t.samples}` : fallback}
        icon={<Clock size={20} />}
        label={t.retrievalWait}
        tone="info"
        value={formatOverviewDuration(data?.retrievalWaitAverageSeconds ?? null, props.locale, "compact")}
        valueDirection={props.locale === "ar" ? "rtl" : "ltr"}
      />
      <OverviewMetricCard
        available={data !== null}
        context={data ? t.periodTotal : fallback}
        danger
        icon={<AlertTriangle size={20} />}
        label={t.incidents}
        tone={data ? "danger" : "info"}
        value={data ? count(data.incidentCount, props.locale) : t.unavailable}
      />
    </div>
  );
}

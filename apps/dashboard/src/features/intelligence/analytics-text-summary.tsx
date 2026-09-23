import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import type { CSSProperties } from "react";
import { formatExactCurrency } from "./intelligence-format";
import { analyticsCopy } from "./analytics-copy";
import {
  handoffEvidence,
  type AnalyticsDurationPresentation,
  type AnalyticsPresentation,
} from "./analytics-presentation";
import styles from "./analytics.module.css";

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};
const evidenceDetailsStyle: CSSProperties = {
  marginTop: "0.75rem",
  paddingTop: "0.75rem",
  borderTop: "1px solid var(--analytics-divider)",
  color: "var(--analytics-evidence)",
  fontSize: "0.75rem",
  lineHeight: "1.125rem",
};
const evidenceSummaryStyle: CSSProperties = {
  width: "fit-content",
  cursor: "pointer",
  fontWeight: 600,
};
const evidenceBodyStyle: CSSProperties = {
  marginTop: "0.625rem",
  maxHeight: "12rem",
  overflow: "auto",
  display: "grid",
  gap: "0.75rem",
};
const evidenceGroupStyle: CSSProperties = { display: "grid", gap: "0.25rem" };
const evidenceStrongStyle: CSSProperties = { color: "var(--analytics-evidence-strong)" };
const evidenceListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "0.375rem",
};

export function ActivityTextSummary(props: {
  readonly data: readonly { readonly date: string; readonly handledCount: number }[];
  readonly locale: DashboardLocale;
}) {
  const t = analyticsCopy(props.locale);
  return (
    <table data-testid="analytics-activity-text" style={visuallyHiddenStyle}>
      <caption>{t.vehicleActivity}</caption>
      <thead>
        <tr><th>{t.chartDate}</th><th>{t.chartCars}</th></tr>
      </thead>
      <tbody>
        {props.data.map((point) => (
          <tr key={point.date}>
            <td><BidiText>{point.date}</BidiText></td>
            <td><BidiText kind="number">{point.handledCount}</BidiText></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DurationTextSummary(props: {
  readonly data: readonly AnalyticsDurationPresentation[];
  readonly locale: DashboardLocale;
}) {
  const t = analyticsCopy(props.locale);
  return (
    <table data-testid="analytics-duration-text" style={visuallyHiddenStyle}>
      <caption>{t.durationComparison}</caption>
      <thead>
        <tr>
          <th>{t.chartMetric}</th>
          <th>{t.chartAverage}</th>
          <th>{t.chartSamples}</th>
          <th>{t.contributingLocations}</th>
        </tr>
      </thead>
      <tbody>
        {props.data.map((point) => (
          <tr key={point.key}>
            <td>{durationLabel(point.key, props.locale)}</td>
            <td>
              {point.averageSeconds === null
                ? t.unavailable
                : <BidiText kind="number">{point.averageSeconds}</BidiText>}
            </td>
            <td><BidiText kind="number">{point.sampleCount}</BidiText></td>
            <td>
              {point.contributingLocationCount === null
                ? t.unavailable
                : <BidiText kind="number">{point.contributingLocationCount}</BidiText>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function durationLabel(
  key: AnalyticsDurationPresentation["key"],
  locale: DashboardLocale,
): string {
  const t = analyticsCopy(locale);
  if (key === "checkInTime") return t.checkInTime;
  if (key === "parkingTime") return t.parkingTime;
  if (key === "retrievalWait") return t.retrievalWait;
  if (key === "retrievalStartLatencyAuxiliary") return t.retrievalStartAuxiliary;
  return t.handoffTime;
}

export function durationShortLabel(
  key: AnalyticsDurationPresentation["key"],
  locale: DashboardLocale,
): string {
  const t = analyticsCopy(locale);
  if (key === "checkInTime") return t.checkInShort;
  if (key === "parkingTime") return t.parkingShort;
  if (key === "retrievalWait") return t.retrievalShort;
  if (key === "retrievalStartLatencyAuxiliary") return t.retrievalStartShort;
  return t.handoffShort;
}

export function AnalyticsSourceEvidence(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  const handoff = handoffEvidence(props.presentation);
  return (
    <details
      className={styles.evidenceDetails}
      data-testid="analytics-source-evidence"
      style={evidenceDetailsStyle}
    >
      <summary style={evidenceSummaryStyle}>{t.sourceEvidence}</summary>
      <div style={evidenceBodyStyle}>
        <EvidenceGroup title={t.financialEvidence}>
          <FinancialEvidence locale={props.locale} presentation={props.presentation} />
        </EvidenceGroup>
        <EvidenceGroup title={t.cashReconciliation}>
          <CashEvidence locale={props.locale} presentation={props.presentation} />
        </EvidenceGroup>
        <EvidenceGroup title={t.incidentTypes}>
          <CodeCounts values={props.presentation.incidents.typeCounts} />
        </EvidenceGroup>
        <EvidenceGroup title={t.incidentSeverities}>
          <CodeCounts values={props.presentation.incidents.severityCounts} />
        </EvidenceGroup>
        <EvidenceGroup title={t.keyExceptions}>
          <CodeCounts values={props.presentation.keyExceptions.byType} />
        </EvidenceGroup>
        <EvidenceGroup title={t.handoffAttributed}>
          <span>
            <BidiText kind="number">{handoff.attributedCount}</BidiText>{" · "}
            {t.handoffMissing}: <BidiText kind="number">{handoff.missingAttributionCount}</BidiText>{" · "}
            {t.employeeEvidence}: <BidiText kind="number">{handoff.employeeEvidenceCount}</BidiText>
            {handoff.truncated ? ` · ${t.truncated}` : ""}
          </span>
        </EvidenceGroup>
      </div>
    </details>
  );
}

function EvidenceGroup(props: { readonly children: React.ReactNode; readonly title: string }) {
  return (
    <section style={evidenceGroupStyle}>
      <strong style={evidenceStrongStyle}>{props.title}</strong>
      {props.children}
    </section>
  );
}

function FinancialEvidence(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  if (props.presentation.financial.currencies.length === 0) return <span>{t.noFinancial}</span>;
  return (
    <ul style={evidenceListStyle}>
      {props.presentation.financial.currencies.map((group) => (
        <li key={group.currency}>
          <BidiText>{group.currency}</BidiText>{" · "}
          {t.paidPayments}: <BidiText kind="number">{group.paidPaymentCount}</BidiText>{" · "}
          {t.collected}: <Money locale={props.locale} value={group.collectedAmountTotal} currency={group.currency} />{" · "}
          {t.tips}: <Money locale={props.locale} value={group.tipAmountTotal} currency={group.currency} />{" · "}
          {t.refunds}: <Money locale={props.locale} value={group.succeededRefundAmountTotal} currency={group.currency} />{" · "}
          {t.currentValidation}:{" "}
          <Money
            locale={props.locale}
            value={group.currentValidationAmountTotal}
            currency={group.currency}
          />{" · "}
          {t.digitalRate}: <Rate value={group.digitalPaymentRate} unavailable={t.unavailable} />{" · "}
          {t.validationRate}: <Rate value={group.validationRate} unavailable={t.unavailable} />
        </li>
      ))}
    </ul>
  );
}

function CashEvidence(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  if (props.presentation.financial.cashReconciliation.length === 0) return <span>{t.noCash}</span>;
  return (
    <ul style={evidenceListStyle}>
      {props.presentation.financial.cashReconciliation.map((group) => (
        <li key={group.currency}>
          <BidiText>{group.currency}</BidiText>{" · "}
          {t.cashExpected}: <Money locale={props.locale} value={group.cashExpectedTotal} currency={group.currency} />{" · "}
          {t.cashReported}: <Money locale={props.locale} value={group.cashReportedTotal} currency={group.currency} />{" · "}
          {t.cashVariance}: <Money locale={props.locale} value={group.cashVarianceTotal} currency={group.currency} />
        </li>
      ))}
    </ul>
  );
}

function Rate(props: {
  readonly unavailable: string;
  readonly value: { readonly numerator: number; readonly denominator: number; readonly percentage: string | null };
}) {
  return (
    <>
      {props.value.percentage === null
        ? props.unavailable
        : <BidiText kind="number">{props.value.percentage}%</BidiText>}
      {" "}
      <BidiText kind="number">
        ({props.value.numerator}/{props.value.denominator})
      </BidiText>
    </>
  );
}

function Money(props: { readonly currency: string; readonly locale: DashboardLocale; readonly value: string }) {
  return (
    <BidiText kind="number">
      {formatExactCurrency(props.value, props.currency, props.locale)}
    </BidiText>
  );
}

function CodeCounts(props: {
  readonly values: readonly { readonly count: number; readonly type?: string; readonly severity?: string }[];
}) {
  if (props.values.length === 0) return <span>—</span>;
  return (
    <ul style={evidenceListStyle}>
      {props.values.map((item) => {
        const code = item.type ?? item.severity ?? "";
        return <li key={code}><BidiText>{code}</BidiText>{": "}<BidiText kind="number">{item.count}</BidiText></li>;
      })}
    </ul>
  );
}

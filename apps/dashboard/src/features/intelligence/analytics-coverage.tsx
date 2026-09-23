import { Car, Clock, Gauge, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";
import {
  companyEvidenceLocationCount,
  companySlaEvidence,
  handoffEvidence,
  type AnalyticsPresentation,
} from "./analytics-presentation";
import { AnalyticsSourceEvidence } from "./analytics-text-summary";
import styles from "./analytics.module.css";

const coverageBandStyle: CSSProperties = {
  marginTop: "0.75rem",
  paddingTop: "0.75rem",
  borderTop: "1px solid var(--analytics-divider)",
  color: "var(--analytics-muted)",
  fontSize: "0.75rem",
  lineHeight: "1.125rem",
  display: "grid",
  gap: "0.375rem",
};
const coverageLineStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.25rem 0.75rem",
};
const boundaryListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: "0.375rem",
  maxHeight: "8rem",
  overflow: "auto",
};
const cardTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
};
const cardValueStyle: CSSProperties = {
  color: "var(--analytics-card-value)",
  fontSize: "1.875rem",
  lineHeight: "2.25rem",
  fontWeight: 700,
  letterSpacing: "-0.025em",
};
const cardLabelStyle: CSSProperties = {
  marginTop: "0.25rem",
  color: "var(--analytics-card-label)",
  fontSize: "0.875rem",
  lineHeight: "1.25rem",
  fontWeight: 500,
};
const cardIconStyle: CSSProperties = {
  width: "2.75rem",
  height: "2.75rem",
  flex: "0 0 2.75rem",
  borderRadius: "9999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardContextStyle: CSSProperties = {
  marginTop: "0.75rem",
  minHeight: "1.25rem",
  maxWidth: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  color: "var(--analytics-card-label)",
  fontSize: "0.75rem",
  lineHeight: "1.125rem",
  display: "flex",
  gap: "0.25rem 0.5rem",
  whiteSpace: "nowrap",
  scrollbarWidth: "none",
};

export function AnalyticsCards(props: {
  readonly locale: DashboardLocale;
  readonly message: string | null;
  readonly presentation: AnalyticsPresentation | null;
}) {
  const t = analyticsCopy(props.locale);
  const p = props.presentation;
  const retrieval = p?.durations.find((item) => item.key === "retrievalWait") ?? null;
  return (
    <div className={styles.cards} data-testid="analytics-card-grid">
      <MetricCard
        context={p ? <CarsEvidence locale={props.locale} presentation={p} /> : null}
        Icon={Car}
        label={t.carsHandled}
        message={props.message}
        tone="blue"
        value={p ? <BidiText kind="number">{p.carsPerActiveEmployee.numerator}</BidiText> : null}
      />
      <MetricCard
        context={retrieval ? (
          <span>
            <BidiText kind="number">{retrieval.sampleCount}</BidiText> {t.samples}
            {retrieval.contributingLocationCount === null ? null : (
              <> · <BidiText kind="number">{retrieval.contributingLocationCount}</BidiText> {t.contributingLocations}</>
            )}
          </span>
        ) : null}
        Icon={Clock}
        label={t.retrievalWait}
        message={props.message}
        tone="emerald"
        value={retrieval?.averageSeconds === null
          ? t.unavailable
          : retrieval?.averageSeconds
            ? <><BidiText kind="number">{retrieval.averageSeconds}</BidiText> {t.seconds}</>
            : null}
      />
      <MetricCard
        context={p ? <SlaEvidence locale={props.locale} presentation={p} /> : null}
        Icon={Gauge}
        label={t.slaCompliance}
        message={props.message}
        tone="blue"
        value={p?.slaCompliance.percentage === null
          ? t.unavailable
          : p?.slaCompliance.percentage
            ? <BidiText kind="number">{p.slaCompliance.percentage}%</BidiText>
            : null}
      />
      <MetricCard
        context={p ? <IncidentEvidence locale={props.locale} presentation={p} /> : null}
        Icon={TriangleAlert}
        label={t.incidents}
        message={props.message}
        tone="amber"
        value={p ? <BidiText kind="number">{p.incidents.incidentCount}</BidiText> : null}
      />
    </div>
  );
}

function MetricCard(props: {
  readonly context: React.ReactNode;
  readonly Icon: LucideIcon;
  readonly label: string;
  readonly message: string | null;
  readonly tone: "amber" | "blue" | "emerald";
  readonly value: React.ReactNode;
}) {
  const toneClass = props.tone === "amber"
    ? styles.iconAmber
    : props.tone === "emerald"
      ? styles.iconEmerald
      : styles.iconBlue;
  return (
    <article className={styles.card} data-testid="analytics-metric-card">
      <div style={cardTopStyle}>
        <div>
          <div data-testid="analytics-card-value" style={cardValueStyle}>
            {props.value ?? "—"}
          </div>
          <div data-testid="analytics-card-label" style={cardLabelStyle}>{props.label}</div>
        </div>
        <div
          className={[styles.cardIcon, toneClass].filter(Boolean).join(" ")}
          data-testid="analytics-card-icon"
          style={cardIconStyle}
        >
          <props.Icon aria-hidden="true" size={20} />
        </div>
      </div>
      <div style={cardContextStyle}>{props.message ?? props.context}</div>
    </article>
  );
}

function CarsEvidence(props: { readonly locale: DashboardLocale; readonly presentation: AnalyticsPresentation }) {
  const t = analyticsCopy(props.locale);
  const cars = props.presentation.carsPerActiveEmployee;
  const handoff = handoffEvidence(props.presentation);
  const evidenceLocations = companyEvidenceLocationCount(props.presentation);
  return (
    <span>
      {t.carsPerActiveEmployee}: {cars.value === null ? t.unavailable : <BidiText kind="number">{cars.value}</BidiText>}
      {" ("}<BidiText kind="number">{cars.numerator}/{cars.denominator}</BidiText>{") · "}
      {t.handoffMissing}: <BidiText kind="number">{handoff.missingAttributionCount}</BidiText>
      {evidenceLocations === null ? null : <> · {t.evidenceLocations}: <BidiText kind="number">{evidenceLocations}</BidiText></>}
    </span>
  );
}

function SlaEvidence(props: { readonly locale: DashboardLocale; readonly presentation: AnalyticsPresentation }) {
  const t = analyticsCopy(props.locale);
  const sla = props.presentation.slaCompliance;
  const company = companySlaEvidence(props.presentation);
  return (
    <span>
      {t.slaEvidence}: <BidiText kind="number">{sla.numerator}/{sla.denominator}</BidiText>
      {" · "}{t.missingTargets}: <BidiText kind="number">{sla.missingTargetCount}</BidiText>
      {" · "}{t.invalidIntervals}: <BidiText kind="number">{sla.invalidOrMissingIntervalCount}</BidiText>
      {company ? (
        <>
          {" · "}{t.requestCount}: <BidiText kind="number">{company.requestCount}</BidiText>
          {" · "}{t.contributingLocations}:{" "}
          <BidiText kind="number">{company.contributingLocationCount}</BidiText>
        </>
      ) : null}
    </span>
  );
}

function IncidentEvidence(props: { readonly locale: DashboardLocale; readonly presentation: AnalyticsPresentation }) {
  const t = analyticsCopy(props.locale);
  const rate = props.presentation.incidents.incidentsPer1000;
  return (
    <span>
      {t.incidentsPer1000}: {rate.value === null ? t.unavailable : <BidiText kind="number">{rate.value}</BidiText>}
      {" ("}<BidiText kind="number">{rate.numerator}/{rate.denominator}</BidiText>{") · "}
      {t.keyExceptions}: <BidiText kind="number">{props.presentation.keyExceptions.count}</BidiText>
    </span>
  );
}

export function AnalyticsCoverage(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  return (
    <>
      {props.presentation.coverage ? (
        <section
          aria-label={t.companyCoverage}
          data-testid="analytics-company-coverage"
          style={coverageBandStyle}
        >
          <strong>{t.companyCoverage}</strong>
          <div style={coverageLineStyle}>
            <Fact label={t.totalLocations} value={props.presentation.coverage.totalLocationCount} />
            <Fact label={t.activeLocations} value={props.presentation.coverage.activeLocationCount} />
            <Fact label={t.inactiveLocations} value={props.presentation.coverage.inactiveLocationCount} />
          </div>
          <span>{t.timezoneBoundaries}</span>
          <ul style={boundaryListStyle}>
            {props.presentation.coverage.timezoneBoundaries.map((boundary) => (
              <li key={boundary.timezone}>
                <BidiText>{boundary.timezone}</BidiText>{" · "}
                {t.totalLocations}: <BidiText kind="number">{boundary.locationCount}</BidiText>{" · "}
                {t.activeLocations}: <BidiText kind="number">{boundary.activeLocationCount}</BidiText>{" · "}
                {t.inactiveLocations}: <BidiText kind="number">{boundary.inactiveLocationCount}</BidiText>{" · "}
                <BidiText>{boundary.periodStartUtc}</BidiText>{" – "}
                <BidiText>{boundary.periodEndUtc}</BidiText>
              </li>
            ))}
          </ul>
        </section>
      ) : props.presentation.sourceTimezone ? (
        <div data-testid="analytics-location-timezone" style={coverageBandStyle}>
          <span>{t.sourceTimezone}: <BidiText>{props.presentation.sourceTimezone}</BidiText></span>
        </div>
      ) : null}
      <AnalyticsSourceEvidence locale={props.locale} presentation={props.presentation} />
    </>
  );
}

function Fact(props: { readonly label: string; readonly value: number }) {
  return <span>{props.label}: <BidiText kind="number">{props.value}</BidiText></span>;
}

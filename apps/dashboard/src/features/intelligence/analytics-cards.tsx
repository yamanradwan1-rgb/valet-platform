import {
  Car,
  Clock,
  Gauge,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";
import type { AnalyticsPresentation } from "./analytics-presentation";
import {
  CarsEvidence,
  SlaEvidence,
  IncidentEvidence,
} from "./analytics-card-evidence";
import { formatOverviewDuration } from "./overview-duration";
import evidenceStyles from "./analytics-evidence.module.css";
import styles from "./analytics.module.css";

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
  minHeight: "1.375rem",
  maxWidth: "100%",
  color: "var(--analytics-card-label)",
  fontSize: "0.75rem",
  lineHeight: "1.125rem",
};

export function AnalyticsCards(props: {
  readonly locale: DashboardLocale;
  readonly message: string | null;
  readonly presentation: AnalyticsPresentation | null;
}) {
  const t = analyticsCopy(props.locale);
  const p = props.presentation;
  const retrieval =
    p?.durations.find((item) => item.key === "retrievalWait") ?? null;
  return (
    <div className={styles.cards} data-testid="analytics-card-grid">
      <MetricCard
        evidenceLabel={t.viewEvidence}
        context={
          p ? <CarsEvidence locale={props.locale} presentation={p} /> : null
        }
        Icon={Car}
        label={t.carsHandled}
        message={props.message}
        tone="blue"
        value={
          p ? (
            <BidiText kind="number">
              {p.carsPerActiveEmployee.numerator}
            </BidiText>
          ) : null
        }
      />
      <MetricCard
        evidenceLabel={t.viewEvidence}
        context={
          retrieval ? (
            <span>
              {t.chartAverage}:{" "}
              <BidiText kind="number">
                {retrieval.averageSeconds ?? t.unavailable}
              </BidiText>
              {" · "}
              <BidiText kind="number">{retrieval.sampleCount}</BidiText>{" "}
              {t.samples}
              {retrieval.contributingLocationCount === null ? null : (
                <>
                  {" "}
                  ·{" "}
                  <BidiText kind="number">
                    {retrieval.contributingLocationCount}
                  </BidiText>{" "}
                  {t.contributingLocations}
                </>
              )}
            </span>
          ) : null
        }
        Icon={Clock}
        label={t.retrievalWait}
        message={props.message}
        tone="emerald"
        value={
          retrieval
            ? formatOverviewDuration(
                retrieval.averageSeconds,
                props.locale,
                "compact",
              )
            : null
        }
      />
      <MetricCard
        evidenceLabel={t.viewEvidence}
        context={
          p ? <SlaEvidence locale={props.locale} presentation={p} /> : null
        }
        Icon={Gauge}
        label={t.slaCompliance}
        message={props.message}
        tone="blue"
        value={
          p?.slaCompliance.percentage === null ? (
            t.unavailable
          ) : p?.slaCompliance.percentage ? (
            <BidiText kind="number">{p.slaCompliance.percentage}%</BidiText>
          ) : null
        }
      />
      <MetricCard
        evidenceLabel={t.viewEvidence}
        context={
          p ? <IncidentEvidence locale={props.locale} presentation={p} /> : null
        }
        Icon={TriangleAlert}
        label={t.incidents}
        message={props.message}
        tone="amber"
        value={
          p ? (
            <BidiText kind="number">{p.incidents.incidentCount}</BidiText>
          ) : null
        }
      />
    </div>
  );
}

function MetricCard(props: {
  readonly context: React.ReactNode;
  readonly evidenceLabel: string;
  readonly Icon: LucideIcon;
  readonly label: string;
  readonly message: string | null;
  readonly tone: "amber" | "blue" | "emerald";
  readonly value: React.ReactNode;
}) {
  const toneClass =
    props.tone === "amber"
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
          <div data-testid="analytics-card-label" style={cardLabelStyle}>
            {props.label}
          </div>
        </div>
        <div
          className={[styles.cardIcon, toneClass].filter(Boolean).join(" ")}
          data-testid="analytics-card-icon"
          style={cardIconStyle}
        >
          <props.Icon aria-hidden="true" size={20} />
        </div>
      </div>
      <div style={cardContextStyle}>
        {props.message ??
          (props.context ? (
            <details className={evidenceStyles.cardEvidence}>
              <summary>{props.evidenceLabel}</summary>
              <div>{props.context}</div>
            </details>
          ) : null)}
      </div>
    </article>
  );
}

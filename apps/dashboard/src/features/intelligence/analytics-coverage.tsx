import type { CSSProperties } from "react";
import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";
import type { AnalyticsPresentation } from "./analytics-presentation";
import { AnalyticsSourceEvidence } from "./analytics-text-summary";
import evidenceStyles from "./analytics-evidence.module.css";

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
            <Fact
              label={t.totalLocations}
              value={props.presentation.coverage.totalLocationCount}
            />
            <Fact
              label={t.activeLocations}
              value={props.presentation.coverage.activeLocationCount}
            />
            <Fact
              label={t.inactiveLocations}
              value={props.presentation.coverage.inactiveLocationCount}
            />
          </div>
          <details className={evidenceStyles.cardEvidence}>
            <summary>{t.timezoneBoundaries}</summary>
            <ul
              aria-label={t.timezoneBoundaries}
              className={evidenceStyles.scrollEvidence}
              style={boundaryListStyle}
              tabIndex={0}
            >
              {props.presentation.coverage.timezoneBoundaries.map(
                (boundary) => (
                  <li key={boundary.timezone}>
                    <BidiText>{boundary.timezone}</BidiText>
                    {" · "}
                    {t.totalLocations}:{" "}
                    <BidiText kind="number">{boundary.locationCount}</BidiText>
                    {" · "}
                    {t.activeLocations}:{" "}
                    <BidiText kind="number">
                      {boundary.activeLocationCount}
                    </BidiText>
                    {" · "}
                    {t.inactiveLocations}:{" "}
                    <BidiText kind="number">
                      {boundary.inactiveLocationCount}
                    </BidiText>
                    {" · "}
                    <BidiText>{boundary.periodStartUtc}</BidiText>
                    {" – "}
                    <BidiText>{boundary.periodEndUtc}</BidiText>
                  </li>
                ),
              )}
            </ul>
          </details>
        </section>
      ) : props.presentation.sourceTimezone ? (
        <div
          data-testid="analytics-location-timezone"
          style={coverageBandStyle}
        >
          <span>
            {t.sourceTimezone}:{" "}
            <BidiText>{props.presentation.sourceTimezone}</BidiText>
          </span>
        </div>
      ) : null}
      <AnalyticsSourceEvidence
        locale={props.locale}
        presentation={props.presentation}
      />
    </>
  );
}

function Fact(props: { readonly label: string; readonly value: number }) {
  return (
    <span>
      {props.label}: <BidiText kind="number">{props.value}</BidiText>
    </span>
  );
}

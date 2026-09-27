import { BidiText } from "../../components/presentation/panel";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { analyticsCopy } from "./analytics-copy";
import {
  companyEvidenceLocationCount,
  companySlaEvidence,
  handoffEvidence,
  type AnalyticsPresentation,
} from "./analytics-presentation";

export function CarsEvidence(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  const cars = props.presentation.carsPerActiveEmployee;
  const handoff = handoffEvidence(props.presentation);
  const evidenceLocations = companyEvidenceLocationCount(props.presentation);
  return (
    <span>
      {t.carsPerActiveEmployee}:{" "}
      {cars.value === null ? (
        t.unavailable
      ) : (
        <BidiText kind="number">{cars.value}</BidiText>
      )}
      {" ("}
      <BidiText kind="number">
        {cars.numerator}/{cars.denominator}
      </BidiText>
      {") · "}
      {t.handoffMissing}:{" "}
      <BidiText kind="number">{handoff.missingAttributionCount}</BidiText>
      {evidenceLocations === null ? null : (
        <>
          {" "}
          · {t.evidenceLocations}:{" "}
          <BidiText kind="number">{evidenceLocations}</BidiText>
        </>
      )}
    </span>
  );
}

export function SlaEvidence(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  const sla = props.presentation.slaCompliance;
  const company = companySlaEvidence(props.presentation);
  return (
    <span>
      {t.slaEvidence}:{" "}
      <BidiText kind="number">
        {sla.numerator}/{sla.denominator}
      </BidiText>
      {" · "}
      {t.missingTargets}:{" "}
      <BidiText kind="number">{sla.missingTargetCount}</BidiText>
      {" · "}
      {t.invalidIntervals}:{" "}
      <BidiText kind="number">{sla.invalidOrMissingIntervalCount}</BidiText>
      {company ? (
        <>
          {" · "}
          {t.requestCount}:{" "}
          <BidiText kind="number">{company.requestCount}</BidiText>
          {" · "}
          {t.contributingLocations}:{" "}
          <BidiText kind="number">{company.contributingLocationCount}</BidiText>
        </>
      ) : null}
    </span>
  );
}

export function IncidentEvidence(props: {
  readonly locale: DashboardLocale;
  readonly presentation: AnalyticsPresentation;
}) {
  const t = analyticsCopy(props.locale);
  const rate = props.presentation.incidents.incidentsPer1000;
  return (
    <span>
      {t.incidentsPer1000}:{" "}
      {rate.value === null ? (
        t.unavailable
      ) : (
        <BidiText kind="number">{rate.value}</BidiText>
      )}
      {" ("}
      <BidiText kind="number">
        {rate.numerator}/{rate.denominator}
      </BidiText>
      {") · "}
      {t.keyExceptions}:{" "}
      <BidiText kind="number">
        {props.presentation.keyExceptions.count}
      </BidiText>
    </span>
  );
}

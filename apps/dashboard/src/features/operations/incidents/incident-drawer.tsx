"use client";
import type { IncidentOverviewEntry } from "@valet/contracts";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { operationsCopy } from "../operations-copy";
import { incidentTone, severityTone } from "../operations-labels";
import { formatOperationsTime } from "../operations-presentation";
import {
  Fact,
  FactList,
  OperationsDrawer,
  StatusBadge,
} from "../operations-ui";
import {
  incidentCopy,
  incidentTypeLabel,
  incidentStatusLabel,
  incidentSeverityLabel,
} from "./incident-presentation";
import incidentDrawerStyles from "./incident-drawer.module.css";
import { ResolveIncidentControl } from "./resolve-incident-control";

export function IncidentDrawer({
  api,
  locationId,
  onResolved,
  onRefresh,
  item,
  locationName,
  timezone,
  onClose,
}: {
  readonly api: DashboardApiClient;
  readonly locationId: string;
  readonly onResolved: (item: IncidentOverviewEntry) => void;
  readonly onRefresh: () => void;
  readonly item: IncidentOverviewEntry;
  readonly locationName: string;
  readonly timezone: string;
  readonly onClose: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const copy = incidentCopy(locale);
  return (
    <OperationsDrawer
      className={incidentDrawerStyles.drawer}
      help={<ScopedContextHelp helpKey="incidents.detail" />}
      label={`${t.details}: ${incidentTypeLabel(item.type, locale)}`}
      onClose={onClose}
    >
      <FactList className={incidentDrawerStyles.facts}>
        <Fact label={t.type} value={incidentTypeLabel(item.type, locale)} />
        <Fact label={t.description} value={<bdi>{item.description}</bdi>} />
        <Fact
          label={t.state}
          value={
            <StatusBadge tone={incidentTone(item.status)}>
              {incidentStatusLabel(item.status, locale)}
            </StatusBadge>
          }
        />
        <Fact
          label={t.severity}
          value={
            <StatusBadge tone={severityTone(item.severity)}>
              {incidentSeverityLabel(item.severity, locale)}
            </StatusBadge>
          }
        />
        <Fact label={copy.location} value={<bdi>{locationName}</bdi>} />
        <Fact
          label={copy.reportedBy}
          value={
            <bdi>{item.reporterDisplayName ?? copy.reporterUnavailable}</bdi>
          }
        />
        <Fact
          label={t.created}
          value={`${formatOperationsTime(item.createdAt, timezone, locale)} (${timezone})`}
        />
        {item.resolvedAt ? (
          <Fact
            label={copy.resolved}
            value={`${formatOperationsTime(item.resolvedAt, timezone, locale)} (${timezone})`}
          />
        ) : null}
        <Fact
          label={copy.incidentId}
          value={<bdi dir="ltr">{item.incidentId}</bdi>}
        />
        <Fact
          label={t.session}
          value={<bdi dir="ltr">{item.valetSessionId}</bdi>}
        />
        <Fact
          label={copy.technicalType}
          value={<bdi dir="ltr">{item.type}</bdi>}
        />
        {item.resolvedAt ? (
          <>
            <Fact
              label={locale === "ar" ? "عالج بواسطة" : "Resolved by"}
              value={
                item.resolvedByDisplayName ??
                (locale === "ar" ? "غير معروف" : "Unknown")
              }
            />
            <Fact
              label={locale === "ar" ? "سبب المعالجة" : "Resolution note"}
              value={<bdi className={incidentDrawerStyles.resolutionNote}>{item.resolutionNotes ?? "—"}</bdi>}
            />
          </>
        ) : null}
      </FactList>
      <ResolveIncidentControl
        api={api}
        locationId={locationId}
        item={item}
        onResolved={onResolved}
        onRefresh={onRefresh}
      />
    </OperationsDrawer>
  );
}

"use client";

import { useCallback, useState } from "react";
import type { IncidentOverviewEntry } from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { readIncidents } from "../operations-api";
import { selectedOperationsLocation } from "../operations-location";
import { formatOperationsTime } from "../operations-presentation";
import {
  incidentCopy,
  incidentTypeLabel,
  incidentStatusLabel,
  incidentSeverityLabel,
} from "./incident-presentation";
import localStyles from "../accountability.module.css";
import { operationsCopy } from "../operations-copy";
import { incidentTone, severityTone } from "../operations-labels";
import {
  DetailAction,
  Fact,
  FactList,
  OperationsDrawer,
  OperationsPage,
  ReferenceCursorControls,
  ReadState,
  StatusBadge,
  styles,
} from "../operations-ui";
import { useCursorPage } from "../use-cursor-page";
import { useOperationsContext } from "../use-operations-context";
import { useOperationsRead } from "../use-operations-read";

export function IncidentsPage() {
  const { scopeKey } = useOperationsContext();
  return <IncidentsContent key={scopeKey} />;
}

function IncidentsContent() {
  const { dashboard, exactLocation, scope, scopeKey } = useOperationsContext();
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const copy = incidentCopy(locale);
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const timezone = location?.timezone ?? "UTC";
  const page = useCursorPage();
  const [selected, setSelected] = useState<IncidentOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled =
    exactLocation &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const load = useCallback(
    (signal: AbortSignal) =>
      readIncidents(dashboard.api, locationId, page.cursor, signal),
    [dashboard.api, locationId, page.cursor],
  );
  const read = useOperationsRead(
    `${scopeKey}:incidents:${page.cursor ?? "first"}`,
    load,
    enabled,
  );
  if (!enabled)
    return (
      <OperationsPage subtitle={t.incidentsSubtitle} title={t.incidentsTitle}>
        <div className={`${styles.card} ${styles.state}`}>
          {t.exactLocation}
        </div>
      </OperationsPage>
    );
  return (
    <OperationsPage
      help={<ScopedContextHelp helpKey="incidents.page" />}
      referenceHeader
      subtitle={t.incidentsSubtitle}
      subtitleMargin="half"
      title={t.incidentsTitle}
    >
      <div className={localStyles.incidentContext}>
        <span>
          <bdi>{location?.name}</bdi>
        </span>
        <span>{copy.cohort}</span>
        <span>
          <bdi dir="ltr">{timezone}</bdi>
        </span>
        <ScopedContextHelp helpKey="incidents.list" />
      </div>
      <ReadState
        empty={read.data?.items.length === 0}
        emptyText={t.noOpenIncidents}
        error={read.error}
        loading={read.loading}
        onRetry={read.refresh}
      >
        <div className={`${styles.card} ${localStyles.card}`}>
          <div
            aria-label={t.incidentsTitle}
            className={styles.tableWrap}
            role="region"
            tabIndex={0}
          >
            <table
              className={`${styles.table} ${styles.incidentTable} ${localStyles.incidentTable}`}
            >
              <thead>
                <tr>
                  <th>{t.created}</th>
                  <th>{t.type}</th>
                  <th>{t.description}</th>
                  <th>{t.state}</th>
                  <th>{t.severity}</th>
                  <th className={styles.actionHeader}>{t.action}</th>
                </tr>
              </thead>
              <tbody>
                {read.data?.items.map((item, index) => (
                  <tr
                    className={`${styles.row} ${localStyles.row}`}
                    key={item.incidentId}
                  >
                    <td>
                      <time dateTime={item.createdAt}>
                        {formatOperationsTime(item.createdAt, timezone, locale)}
                      </time>
                    </td>
                    <td className={styles.primaryText}>
                      {incidentTypeLabel(item.type, locale)}
                    </td>
                    <td className={localStyles.description}>
                      <bdi>{item.description}</bdi>
                    </td>
                    <td>
                      <StatusBadge tone={incidentTone(item.status)}>
                        {incidentStatusLabel(item.status, locale)}
                      </StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={severityTone(item.severity)}>
                        {incidentSeverityLabel(item.severity, locale)}
                      </StatusBadge>
                    </td>
                    <td className={styles.actionCell}>
                      <DetailAction
                        label={`${t.details}: ${index + 1} — ${incidentTypeLabel(item.type, locale)}`}
                        onClick={() => setSelected(item)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ReferenceCursorControls
            canNext={Boolean(read.data?.nextCursor)}
            canPrevious={page.canPrevious}
            label={`${t.currentPageOnly}: ${read.data?.items.length ?? 0}`}
            onNext={() => {
              setSelected(null);
              page.next(read.data?.nextCursor ?? null);
            }}
            onPrevious={() => {
              setSelected(null);
              page.previous();
            }}
            size="incidents"
          />
        </div>
      </ReadState>
      {selected && !read.error && !read.loading ? (
        <IncidentDrawer
          item={selected}
          locationName={location?.name ?? ""}
          timezone={timezone}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </OperationsPage>
  );
}

function IncidentDrawer({
  item,
  locationName,
  timezone,
  onClose,
}: {
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
      help={<ScopedContextHelp helpKey="incidents.detail" />}
      label={`${t.details}: ${incidentTypeLabel(item.type, locale)}`}
      onClose={onClose}
    >
      <FactList>
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
      </FactList>
    </OperationsDrawer>
  );
}

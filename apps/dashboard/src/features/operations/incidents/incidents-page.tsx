"use client";

import { useCallback, useState } from "react";
import type {
  IncidentListFilter,
  IncidentOverviewEntry,
} from "@valet/contracts";

import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { readIncidents } from "../operations-api";
import { selectedOperationsLocation } from "../operations-location";
import { formatOperationsTime } from "../operations-presentation";
import {
  incidentTypeLabel,
  incidentStatusLabel,
  incidentSeverityLabel,
} from "./incident-presentation";
import { IncidentDrawer } from "./incident-drawer";
import incidentControls from "./incident-drawer.module.css";
import localStyles from "../accountability.module.css";
import { operationsCopy } from "../operations-copy";
import { incidentTone, severityTone } from "../operations-labels";
import {
  DetailAction,
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
  const location = selectedOperationsLocation(dashboard.selectedScope);
  const timezone = location?.timezone ?? "UTC";
  const page = useCursorPage();
  const [filter, setFilter] = useState<IncidentListFilter>("ALL");
  const [selected, setSelected] = useState<IncidentOverviewEntry | null>(null);
  const locationId = scope.locationId ?? "";
  const enabled =
    exactLocation &&
    (scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "LOCATION_MANAGER");
  const load = useCallback(
    (signal: AbortSignal) =>
      readIncidents(dashboard.api, locationId, page.cursor, signal, filter),
    [dashboard.api, locationId, page.cursor, filter],
  );
  const read = useOperationsRead(
    `${scopeKey}:incidents:${filter}:${page.cursor ?? "first"}`,
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
      help={
        <span className={styles.incidentPageHelpPair}>
          <ScopedContextHelp helpKey="incidents.page" />
          <ScopedContextHelp helpKey="incidents.list" />
        </span>
      }
      pairedHelp
      referenceHeader
      subtitle={t.incidentsSubtitle}
      subtitleMargin="half"
      title={t.incidentsTitle}
    >
      <div className={localStyles.incidentContext}>
        <span>
          <bdi>{location?.name}</bdi>
        </span>
        <span>
          <select
            id="incident-status-filter"
            className={`${styles.filterPlaceholder} ${incidentControls.statusFilter}`}
            aria-label={locale === "ar" ? "حالة الحادث" : "Incident status"}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as IncidentListFilter);
              page.reset();
              setSelected(null);
            }}
          >
            <option value="ALL">
              {locale === "ar" ? "الكل" : "All incidents"}
            </option>
            <option value="ACTIVE">
              {locale === "ar" ? "نشطة" : "Active"}
            </option>
            <option value="RESOLVED">
              {locale === "ar" ? "محلولة" : "Resolved"}
            </option>
          </select>
        </span>
        <span>
          <bdi dir="ltr">{timezone}</bdi>
        </span>
      </div>
      <ReadState
        empty={read.data?.items.length === 0}
        emptyText={
          locale === "ar"
            ? "لا توجد حوادث لهذا الفلتر."
            : "No incidents in this view."
        }
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
                    data-incident-id={item.incidentId}
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
      {selected && !read.error ? (
        <IncidentDrawer
          api={dashboard.api}
          locationId={locationId}
          onRefresh={() => {
            setSelected(null);
            read.refresh();
          }}
          onResolved={(item) => {
            setSelected(item);
            if (filter !== "ALL") {
              setFilter("ALL");
              page.reset();
            }
            read.refresh();
          }}
          item={
            selected.status === "RESOLVED"
              ? selected
              : (read.data?.items.find(
                  (item) => item.incidentId === selected.incidentId,
                ) ?? selected)
          }
          locationName={location?.name ?? ""}
          timezone={timezone}
          onClose={() => {
            const incidentId = selected.incidentId;
            setSelected(null);
            requestAnimationFrame(() => {
              const opener = document.querySelector<HTMLButtonElement>(
                `[data-incident-id="${incidentId}"] button`,
              );
              (
                opener ?? document.getElementById("incident-status-filter")
              )?.focus();
            });
          }}
        />
      ) : null}
    </OperationsPage>
  );
}

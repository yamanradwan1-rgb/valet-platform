"use client";
import { useCallback, useMemo } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../../help/scoped-context-help";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { ReadState } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { StaffCursorControls } from "./staff-cursor-controls";
import { StaffShiftManagementDrawer } from "./staff-shift-management-drawer";
import type { ForceEndRecovery } from "./staff-force-end-recovery";
import { StaffShiftEmployeeFilter } from "./staff-shift-employee-filter";
import { StaffShiftLocationFilter } from "./staff-shift-location-filter";
import { StaffShiftRows } from "./staff-shift-rows";
import { readShiftDetail, readShiftHistory } from "./staff-shift-history-api";
import { staffShiftHistoryCopy } from "./staff-shift-history-copy";
import { historyDateRange } from "./staff-shift-time";
import { useShiftClock } from "./use-shift-clock";
import { useStaffShiftQuery } from "./use-staff-shift-query";
import css from "./staff-reference.module.css";
import filterCss from "./staff-shift-filters.module.css";
export function StaffShiftsBody(props: {
  readonly recovery?: ForceEndRecovery | null;
  readonly onRecoveryConsumed?: () => void;
}) {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard),
    { organizationId, authority } = administrationScope(
      dashboard.selectedScope,
    );
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale),
    h = staffShiftHistoryCopy(locale);
  const query = useStaffShiftQuery(props.recovery?.shiftId ?? null),
    f = query.filters;
  const timezone = f.location?.timezone ?? "UTC";
  const range = useMemo(
    () => historyDateRange(f.from, f.to, timezone),
    [f.from, f.to, timezone],
  );
  const filters = useMemo(
    () => ({
      membershipId: f.membershipId,
      locationId: f.location?.locationId,
      status: f.status,
      from: range.valid ? range.from : undefined,
      to: range.valid ? range.to : undefined,
    }),
    [f.membershipId, f.location?.locationId, f.status, range],
  );
  const key = `${scopeKey}:shift-history:${JSON.stringify(filters)}:${query.generation}`;
  const load = useCallback(
    (signal: AbortSignal) =>
      readShiftHistory(
        dashboard.api,
        organizationId,
        { ...filters, cursor: query.cursor ?? undefined, limit: 50 },
        signal,
      ),
    [dashboard.api, organizationId, filters, query.cursor],
  );
  const history = useAuthoritativeRead(
    `${key}:${query.cursor ?? "first"}`,
    load,
    range.valid,
  );
  const locationKey = `${key}:locations:${history.error ? "denied" : "current"}`;
  const loadDetail = useCallback(
    (signal: AbortSignal) =>
      readShiftDetail(dashboard.api, organizationId, query.shiftId!, signal),
    [dashboard.api, organizationId, query.shiftId],
  );
  const detail = useAuthoritativeRead(
    `${key}:detail:${query.shiftId ?? "none"}:${query.detailGeneration}`,
    loadDetail,
    query.shiftId !== null && range.valid && !history.error,
  );
  const items = history.data?.items ?? [];
  const now = useShiftClock(
    items.some((item) => item.status === "ACTIVE") ||
      detail.data?.status === "ACTIVE",
  );
  const { close: closeShift, shiftId: selectedShiftId } = query;
  const closeSelectedShift = useCallback(() => {
    closeShift();
    queueMicrotask(() => {
      const row = document.querySelector<HTMLButtonElement>(
        `[data-shift-detail="${selectedShiftId}"]`,
      );
      (
        row ??
        document.querySelector<HTMLButtonElement>(
          "[data-shift-history-refresh]",
        )
      )?.focus();
    });
  }, [closeShift, selectedShiftId]);
  return (
    <>
      <div className={css.content}>
        <div className={css.toolbar}>
          <div className={css.controls}>
            {!history.error ? (
              <StaffShiftEmployeeFilter
                key={key + ":employees"}
                organizationId={organizationId}
                scopeKey={key}
                locationId={f.location?.locationId}
                membershipId={f.membershipId}
                value={
                  items.find((item) => item.membershipId === f.membershipId) ??
                  null
                }
                onChange={(employee) =>
                  query.change({ membershipId: employee?.membershipId })
                }
              />
            ) : null}
            <StaffShiftLocationFilter
              key={locationKey}
              organizationId={organizationId}
              scopeKey={locationKey}
              value={f.location}
              displayAuthorized={
                history.data !== null && !history.loading && range.valid
              }
              onChange={(location) =>
                query.change({ location, membershipId: undefined })
              }
            />
            <select
              aria-label={t.status}
              className={`${css.select} ${css.statusSelect}`}
              value={f.status ?? "ALL"}
              onChange={(event) =>
                query.change({
                  status:
                    event.target.value === "ALL"
                      ? undefined
                      : (event.target.value as "ACTIVE" | "ENDED"),
                })
              }
            >
              <option value="ALL">{h.allStatuses}</option>
              <option value="ACTIVE">{t.active}</option>
              <option value="ENDED">{h.ended}</option>
            </select>
            <label className={filterCss.dateFilter}>
              {h.from}{" "}
              <input
                aria-label={h.from}
                className={css.select}
                type="date"
                value={f.from}
                aria-invalid={!range.valid}
                aria-describedby={!range.valid ? "shift-date-error" : undefined}
                onChange={(event) => query.change({ from: event.target.value })}
              />
            </label>
            <label className={filterCss.dateFilter}>
              {h.to}{" "}
              <input
                aria-label={h.to}
                className={css.select}
                type="date"
                value={f.to}
                aria-invalid={!range.valid}
                aria-describedby={!range.valid ? "shift-date-error" : undefined}
                onChange={(event) => query.change({ to: event.target.value })}
              />
            </label>
            <button
              className={css.select}
              type="button"
              onClick={query.refresh}
              data-shift-history-refresh
            >
              {h.refresh}
            </button>
            <ScopedContextHelp helpKey="staff.shifts" />
          </div>
        </div>
        <div className={css.scopeNote}>
          {h.timezone}: <bdi dir="ltr">{timezone}</bdi>
        </div>
        {!range.valid ? (
          <div id="shift-date-error" role="alert">
            {h.invalidRange}
          </div>
        ) : (
          <ReadState
            loading={history.loading}
            error={
              history.error
                ? new Error(administrationErrorMessage(history.error))
                : null
            }
            onRetry={query.refresh}
          >
            <div className={css.card}>
              <div className={css.tableWrap}>
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th>{h.employee}</th>
                      <th>{t.location}</th>
                      <th>{t.status}</th>
                      <th>{t.startedAt}</th>
                      <th>{h.endedAt}</th>
                      <th>{h.duration}</th>
                      <th className={css.actionHeader}>{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <StaffShiftRows
                      items={items}
                      locale={locale}
                      now={now}
                      onSelect={query.select}
                    />
                  </tbody>
                </table>
              </div>
              <StaffCursorControls
                canNext={Boolean(history.data?.nextCursor)}
                canPrevious={query.history.length > 0}
                label={t.loadedCursorPage}
                loading={history.loading}
                locale={locale}
                onNext={() => {
                  if (history.data?.nextCursor)
                    query.next(history.data.nextCursor);
                }}
                onPrevious={query.previous}
              />
            </div>
          </ReadState>
        )}
      </div>
      {query.shiftId && range.valid ? (
        <StaffShiftManagementDrawer
          key={`${scopeKey}:selection:${query.selectionGeneration}:${query.shiftId}`}
          read={{
            item: detail.data,
            loading: detail.loading || history.loading,
            error: history.error ?? detail.error,
            revision: query.detailGeneration,
          }}
          organizationId={organizationId}
          authorized={
            authority === "COMPANY_ADMIN" || authority === "LOCATION_MANAGER"
          }
          recovery={
            query.selectionGeneration === 0 ? (props.recovery ?? null) : null
          }
          onRecoveryConsumed={props.onRecoveryConsumed}
          now={now}
          onClose={closeSelectedShift}
          onRetry={detail.refresh}
          onReconcile={query.reconcileSelected}
        />
      ) : null}
    </>
  );
}

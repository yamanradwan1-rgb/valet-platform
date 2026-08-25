"use client";

import type { ActiveShiftOverviewEntry } from "@valet/contracts";

import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import { PageHeader } from "../../components/ui/page-header";
import { Skeleton } from "../../components/ui/skeleton";
import {
  DataCell,
  MobileDataRow,
  TableShell,
} from "../../components/ui/table-primitives";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { useTranslation } from "../../i18n/locale-provider";

import { overviewErrorMessageKey } from "./error-message";
import { formatTimestamp } from "./format-datetime";
import { shortIdentifier } from "./format-identifier";
import { KpiStat } from "./kpi-stat";
import { LoadMoreSection } from "./load-more-section";
import { fetchActiveShiftsPage } from "./overview-endpoints";
import { useOverviewCursorList } from "./use-overview-cursor-list";

/**
 * Active Shifts — read-only.
 *
 * The backend intentionally exposes only `shiftId`, `membershipId` and
 * `startedAt` for ACTIVE shifts. No employee identity, performance or task
 * totals are rendered because none exist in the endpoint response.
 */
export function ActiveShiftsView() {
  const { t, locale } = useTranslation();
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? null;

  const list = useOverviewCursorList<ActiveShiftOverviewEntry>({
    enabled: locationId !== null,
    fetchPage: (cursor) => {
      if (locationId === null) {
        return Promise.reject(new Error("overview location unconfigured"));
      }
      return fetchActiveShiftsPage(client, locationId, cursor);
    },
  });

  if (locationId === null) {
    return (
      <>
        <PageHeader
          title={t("page.activeShifts.title")}
          description={t("page.activeShifts.description")}
        />
        <p className="scope-note">{t("placeholder.locationMissingNote")}</p>
      </>
    );
  }

  const { status, items, nextCursor, error, paginationError, load, loadMore } =
    list;
  const showInitialSkeleton =
    status === "idle" || (status === "loading" && items.length === 0);
  const showInitialError = status === "error" && items.length === 0;
  const showEmpty =
    !showInitialSkeleton && !showInitialError && items.length === 0;

  return (
    <>
      <PageHeader
        title={t("page.activeShifts.title")}
        description={t("page.activeShifts.description")}
      />
      <div className="overview-kpi-grid is-single-column is-sm-three">
        <KpiStat
          label={t("page.activeShifts.kpiLabel")}
          value={items.length}
          sub={t("page.activeShifts.kpiSub")}
        />
      </div>
      <p className="scope-note">{t("page.activeShifts.scopeNote")}</p>

      {showInitialSkeleton && <Skeleton lines={6} label={t("states.loading")} />}
      {showInitialError && (
        <ErrorState
          message={t(overviewErrorMessageKey(error))}
          onRetry={load}
          retryLabel={t("actions.retry")}
        />
      )}
      {showEmpty && <EmptyState message={t("page.activeShifts.empty")} />}

      {items.length > 0 && (
        <>
          <div className="responsive-table-block">
            <TableShell
              headers={[
                t("page.activeShifts.column.shiftId"),
                t("page.activeShifts.column.membershipId"),
                t("page.activeShifts.column.startedAt"),
              ]}
            >
              {items.map((shift) => (
                <tr key={shift.shiftId}>
                  <DataCell mono>{shift.shiftId}</DataCell>
                  <DataCell mono>{shift.membershipId}</DataCell>
                  <DataCell>
                    {formatTimestamp(shift.startedAt, locale)}
                  </DataCell>
                </tr>
              ))}
            </TableShell>
          </div>
          <div className="responsive-list-block">
            {items.map((shift) => (
              <MobileDataRow
                key={shift.shiftId}
                title={shortIdentifier(shift.shiftId)}
                subtitle={t("page.activeShifts.rowSubtitle")}
                fields={[
                  {
                    label: t("page.activeShifts.column.membershipId"),
                    value: shortIdentifier(shift.membershipId),
                  },
                  {
                    label: t("page.activeShifts.column.startedAt"),
                    value: formatTimestamp(shift.startedAt, locale),
                  },
                ]}
              />
            ))}
          </div>
          <LoadMoreSection
            nextCursor={nextCursor}
            isLoadingMore={status === "loadingMore"}
            paginationError={paginationError}
            onLoadMore={loadMore}
          />
        </>
      )}
    </>
  );
}

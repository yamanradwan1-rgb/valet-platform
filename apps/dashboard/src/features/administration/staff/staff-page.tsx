"use client";

import type { ActiveShiftOverviewEntry } from "@valet/contracts";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import {
  AdministrationPage,
  ReadState,
  StatusBadge,
  styles,
} from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { StaffCursorControls } from "./staff-cursor-controls";
import { StaffEmployeesBody } from "./staff-employees-body";
import { readActiveShifts } from "./staff-api";
import {
  formatStaffTime,
  selectedStaffLocation,
  staffShiftDetailLabels,
} from "./staff-presentation";
import referenceStyles from "./staff-reference.module.css";
import { StaffShiftDrawer } from "./staff-shift-drawer";

export function StaffPage() {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  return <StaffPageContent key={scopeKey} />;
}

function StaffPageContent() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const location = selectedStaffLocation(dashboard.selectedScope);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const companyAdmin = scope.authority === "COMPANY_ADMIN";
  const locationManager = scope.authority === "LOCATION_MANAGER";
  const [tab, setTab] = useState<"employees" | "shifts">(
    companyAdmin ? "employees" : "shifts",
  );
  const [shiftCursor, setShiftCursor] = useState<string | null>(null);
  const [shiftHistory, setShiftHistory] = useState<(string | null)[]>([]);
  const [selectedShift, setSelectedShift] =
    useState<ActiveShiftOverviewEntry | null>(null);
  const shiftLocationAvailable = location?.status === "ACTIVE";
  const shiftLocationId = location?.locationId ?? "";

  const loadShifts = useCallback(
    (signal: AbortSignal) =>
      readActiveShifts(dashboard.api, shiftLocationId, shiftCursor, signal),
    [dashboard.api, shiftLocationId, shiftCursor],
  );
  const shifts = useAuthoritativeRead(
    `${scopeKey}:shifts:${shiftCursor ?? "first"}`,
    loadShifts,
    (companyAdmin || locationManager) &&
      tab === "shifts" &&
      shiftLocationAvailable,
  );

  if (!companyAdmin && !locationManager) return null;
  return (
    <AdministrationPage
      subtitle={
        companyAdmin ? t.employeesSubtitle : t.employeesLocationManagerSubtitle
      }
      subtitleSize="sm"
      title={t.employeesTitle}
      titleTracking="tight"
    >
      <div
        className={`${styles.tabs} ${styles.staffTabs} ${referenceStyles.tabsOffset}`}
      >
        {companyAdmin ? (
          <button
            aria-pressed={tab === "employees"}
            className={`${styles.tab} ${styles.staffTab} ${tab === "employees" ? `${styles.tabActive} ${styles.staffTabActive}` : ""}`}
            onClick={() => switchTab("employees")}
            type="button"
          >
            {t.employees}
          </button>
        ) : null}
        <button
          aria-pressed={tab === "shifts"}
          className={`${styles.tab} ${styles.staffTab} ${tab === "shifts" ? `${styles.tabActive} ${styles.staffTabActive}` : ""}`}
          onClick={() => switchTab("shifts")}
          type="button"
        >
          {t.shifts}
        </button>
      </div>
      {tab === "employees" && companyAdmin ? <StaffEmployeesBody /> : null}
      {tab === "shifts" ? renderShifts() : null}
      {selectedShift && location ? (
        <StaffShiftDrawer
          item={selectedShift}
          location={location}
          onClose={() => setSelectedShift(null)}
        />
      ) : null}
    </AdministrationPage>
  );

  function switchTab(next: "employees" | "shifts") {
    setSelectedShift(null);
    setTab(next);
  }

  function nextShifts() {
    const nextCursor = shifts.data?.nextCursor ?? null;
    if (!nextCursor) return;
    setSelectedShift(null);
    setShiftHistory((history) => [...history, shiftCursor]);
    setShiftCursor(nextCursor);
  }

  function previousShifts() {
    if (shiftHistory.length === 0) return;
    setSelectedShift(null);
    const history = [...shiftHistory];
    setShiftCursor(history.pop() ?? null);
    setShiftHistory(history);
  }

  function renderShifts() {
    if (!shiftLocationAvailable || !location) {
      return (
        <div className={`${styles.card} ${styles.empty}`}>
          {scope.locationId === null
            ? t.selectLocation
            : t.activeLocationRequired}
        </div>
      );
    }
    return (
      <div className={referenceStyles.content}>
        <div className={referenceStyles.toolbar}>
          <span className={referenceStyles.locationContext}>
            {location.name}
          </span>
        </div>
        <ReadState
          error={
            shifts.error
              ? new Error(administrationErrorMessage(shifts.error))
              : null
          }
          loading={shifts.loading}
          onRetry={shifts.refresh}
        >
          <div className={referenceStyles.card}>
            <div className={referenceStyles.tableWrap}>
              <table className={referenceStyles.table}>
                <thead>
                  <tr>
                    <th>{t.shift}</th>
                    <th>{t.location}</th>
                    <th>{t.status}</th>
                    <th>{t.startedAt}</th>
                    <th className={referenceStyles.actionHeader}>
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <ShiftRows
                    items={shifts.data?.items ?? []}
                    locale={locale}
                    location={location}
                    onSelect={setSelectedShift}
                  />
                </tbody>
              </table>
            </div>
            <StaffCursorControls
              canNext={Boolean(shifts.data?.nextCursor)}
              canPrevious={shiftHistory.length > 0}
              label={t.loadedCursorPage}
              loading={shifts.loading}
              locale={locale}
              onNext={nextShifts}
              onPrevious={previousShifts}
            />
          </div>
        </ReadState>
      </div>
    );
  }
}

function ShiftRows(props: {
  readonly items: readonly ActiveShiftOverviewEntry[];
  readonly locale: "en" | "ar";
  readonly location: NonNullable<ReturnType<typeof selectedStaffLocation>>;
  readonly onSelect: (item: ActiveShiftOverviewEntry) => void;
}) {
  const t = administrationCopy(props.locale);
  if (props.items.length === 0)
    return (
      <tr>
        <td className={referenceStyles.emptyCell} colSpan={5}>
          {t.noActiveShifts}
        </td>
      </tr>
    );
  const detailLabels = staffShiftDetailLabels(
    props.items,
    props.location,
    props.locale,
  );
  return (
    <>
      {props.items.map((item, index) => (
        <tr key={item.shiftId}>
          <td className={referenceStyles.primary}>{t.activeShift}</td>
          <td>
            <div className={referenceStyles.primary}>{props.location.name}</div>
            <div className={referenceStyles.secondary}>
              <bdi dir="ltr">{props.location.code}</bdi>
            </div>
          </td>
          <td>
            <StatusBadge good>{t.active}</StatusBadge>
          </td>
          <td>
            <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
              {formatStaffTime(
                item.startedAt,
                props.location.timezone,
                props.locale,
              )}
            </bdi>
          </td>
          <td className={referenceStyles.actionCell}>
            <button
              aria-label={detailLabels[index]}
              className={referenceStyles.detailAction}
              onClick={() => props.onSelect(item)}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={18} />
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

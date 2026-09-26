"use client";

import type {
  ActiveShiftOverviewEntry,
  StaffDirectoryItem,
  StaffManagementRole,
} from "@valet/contracts";
import { MoreHorizontal, Search } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import { administrationScope, administrationScopeKey } from "../administration-scope";
import { AdministrationPage, ReadState, StatusBadge, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { StaffCursorControls } from "./staff-cursor-controls";
import { StaffDetailDrawer } from "./staff-detail-drawer";
import { readActiveShifts, readStaffDetail, readStaffDirectory } from "./staff-api";
import { staffRoleLabel, staffStatusLabel } from "./staff-labels";
import { formatStaffTime, selectedStaffLocation } from "./staff-presentation";
import referenceStyles from "./staff-reference.module.css";
import { StaffShiftDrawer } from "./staff-shift-drawer";

type RoleFilter = StaffManagementRole | "ALL";
type StatusFilter = StaffDirectoryItem["status"] | "ALL";
const roles: readonly StaffManagementRole[] = [
  "ORG_ADMIN", "LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE",
];

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
  const [tab, setTab] = useState<"employees" | "shifts">(companyAdmin ? "employees" : "shifts");
  const [directoryCursor, setDirectoryCursor] = useState<string | null>(null);
  const [directoryHistory, setDirectoryHistory] = useState<(string | null)[]>([]);
  const [shiftCursor, setShiftCursor] = useState<string | null>(null);
  const [shiftHistory, setShiftHistory] = useState<(string | null)[]>([]);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [selectedShift, setSelectedShift] = useState<ActiveShiftOverviewEntry | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const shiftLocationAvailable = location?.status === "ACTIVE";
  const shiftLocationId = location?.locationId ?? "";

  const loadDirectory = useCallback((signal: AbortSignal) =>
    readStaffDirectory(dashboard.api, scope.organizationId, directoryCursor, signal),
  [dashboard.api, scope.organizationId, directoryCursor]);
  const directory = useAuthoritativeRead(
    `${scopeKey}:staff:${directoryCursor ?? "first"}`,
    loadDirectory,
    companyAdmin && tab === "employees",
  );
  const loadShifts = useCallback((signal: AbortSignal) =>
    readActiveShifts(dashboard.api, shiftLocationId, shiftCursor, signal),
  [dashboard.api, shiftLocationId, shiftCursor]);
  const shifts = useAuthoritativeRead(
    `${scopeKey}:shifts:${shiftCursor ?? "first"}`,
    loadShifts,
    (companyAdmin || locationManager) && tab === "shifts" && shiftLocationAvailable,
  );
  const loadDetail = useCallback((signal: AbortSignal) => {
    if (!membershipId) return Promise.reject(new Error("No membership selected."));
    return readStaffDetail(dashboard.api, scope.organizationId, membershipId, signal);
  }, [dashboard.api, membershipId, scope.organizationId]);
  const detail = useAuthoritativeRead(
    `${scopeKey}:staff-detail:${membershipId ?? "none"}`,
    loadDetail,
    companyAdmin && membershipId !== null,
  );

  const sourceEmployees = directory.data?.items ?? [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const employees = sourceEmployees.filter((item) =>
    (normalizedQuery === "" || item.identity.email.toLocaleLowerCase().includes(normalizedQuery)) &&
    (roleFilter === "ALL" || item.role === roleFilter) &&
    (statusFilter === "ALL" || item.status === statusFilter));

  if (!companyAdmin && !locationManager) return null;
  return (
    <AdministrationPage subtitle={t.employeesSubtitle} subtitleSize="sm" title={t.employeesTitle} titleTracking="tight">
      <div className={`${styles.tabs} ${styles.staffTabs} ${referenceStyles.tabsOffset}`}>
        {companyAdmin ? <button aria-pressed={tab === "employees"} className={`${styles.tab} ${styles.staffTab} ${tab === "employees" ? `${styles.tabActive} ${styles.staffTabActive}` : ""}`} onClick={() => switchTab("employees")} type="button">{t.employees}</button> : null}
        <button aria-pressed={tab === "shifts"} className={`${styles.tab} ${styles.staffTab} ${tab === "shifts" ? `${styles.tabActive} ${styles.staffTabActive}` : ""}`} onClick={() => switchTab("shifts")} type="button">{t.shifts}</button>
      </div>
      {tab === "employees" && companyAdmin ? renderEmployees() : null}
      {tab === "shifts" ? renderShifts() : null}
      {membershipId && detail.data ? <StaffDetailDrawer api={dashboard.api} detail={detail.data}
        onChanged={() => { detail.refresh(); directory.refresh(); }} onClose={() => setMembershipId(null)}
        onConflict={() => { detail.refresh(); directory.refresh(); }} organizationId={scope.organizationId}
        selectedLocationId={scope.locationId} /> : null}
      {selectedShift && location ? <StaffShiftDrawer item={selectedShift} location={location} onClose={() => setSelectedShift(null)} /> : null}
    </AdministrationPage>
  );

  function switchTab(next: "employees" | "shifts") {
    setMembershipId(null);
    setSelectedShift(null);
    setTab(next);
  }

  function resetEmployeePageState() {
    setQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setMembershipId(null);
  }

  function nextEmployees() {
    const nextCursor = directory.data?.nextCursor ?? null;
    if (!nextCursor) return;
    resetEmployeePageState();
    setDirectoryHistory((history) => [...history, directoryCursor]);
    setDirectoryCursor(nextCursor);
  }

  function previousEmployees() {
    if (directoryHistory.length === 0) return;
    resetEmployeePageState();
    const history = [...directoryHistory];
    setDirectoryCursor(history.pop() ?? null);
    setDirectoryHistory(history);
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

  function renderEmployees() {
    return <div className={referenceStyles.content}>
      <div className={referenceStyles.toolbar}>
        <div className={referenceStyles.controls}>
          <label className={referenceStyles.search}>
            <Search aria-hidden="true" />
            <input aria-describedby="staff-loaded-page-note" aria-label={t.searchEmployees}
              onChange={(event) => setQuery(event.target.value)} placeholder={t.searchEmployees} type="search" value={query} />
          </label>
          <select aria-label={t.role} className={`${referenceStyles.select} ${referenceStyles.roleSelect}`}
            onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} value={roleFilter}>
            <option value="ALL">{t.allRoles}</option>
            {roles.map((role) => <option key={role} value={role}>{staffRoleLabel(role, t)}</option>)}
          </select>
          <select aria-label={t.status} className={`${referenceStyles.select} ${referenceStyles.statusSelect}`}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} value={statusFilter}>
            <option value="ALL">{t.allMembershipStatuses}</option>
            <option value="ACTIVE">{t.active}</option><option value="INACTIVE">{t.inactive}</option>
          </select>
        </div>
        <span className={referenceStyles.scopeNote} id="staff-loaded-page-note">{t.loadedPageOnly}</span>
      </div>
      <ReadState error={directory.error ? new Error(administrationErrorMessage(directory.error)) : null} loading={directory.loading} onRetry={directory.refresh}>
        <div className={referenceStyles.card}>
          <div className={referenceStyles.tableWrap}><table className={referenceStyles.table}>
            <thead><tr><th>{t.email}</th><th>{t.role}</th><th>{t.status}</th><th>{t.locationAccess}</th><th className={referenceStyles.actionHeader}>{t.actions}</th></tr></thead>
            <tbody><EmployeeRows items={employees} locale={locale} onSelect={setMembershipId} sourceEmpty={sourceEmployees.length === 0} /></tbody>
          </table></div>
          <StaffCursorControls canNext={Boolean(directory.data?.nextCursor)} canPrevious={directoryHistory.length > 0}
            label={t.loadedCursorPage} loading={directory.loading} locale={locale} onNext={nextEmployees} onPrevious={previousEmployees} />
        </div>
      </ReadState>
    </div>;
  }

  function renderShifts() {
    if (!shiftLocationAvailable || !location) {
      return <div className={`${styles.card} ${styles.empty}`}>{scope.locationId === null ? t.selectLocation : t.activeLocationRequired}</div>;
    }
    return <div className={referenceStyles.content}>
      <div className={referenceStyles.toolbar}>
        <span className={referenceStyles.locationContext}>{location.name}</span>
      </div>
      <ReadState error={shifts.error ? new Error(administrationErrorMessage(shifts.error)) : null} loading={shifts.loading} onRetry={shifts.refresh}>
        <div className={referenceStyles.card}>
          <div className={referenceStyles.tableWrap}><table className={referenceStyles.table}>
            <thead><tr><th>{t.shift}</th><th>{t.location}</th><th>{t.status}</th><th>{t.startedAt}</th><th className={referenceStyles.actionHeader}>{t.actions}</th></tr></thead>
            <tbody><ShiftRows items={shifts.data?.items ?? []} locale={locale} location={location} onSelect={setSelectedShift} /></tbody>
          </table></div>
          <StaffCursorControls canNext={Boolean(shifts.data?.nextCursor)} canPrevious={shiftHistory.length > 0}
            label={t.loadedCursorPage} loading={shifts.loading} locale={locale} onNext={nextShifts} onPrevious={previousShifts} />
        </div>
      </ReadState>
    </div>;
  }
}

function EmployeeRows(props: { readonly items: readonly StaffDirectoryItem[]; readonly locale: "en" | "ar"; readonly onSelect: (id: string) => void; readonly sourceEmpty: boolean }) {
  const t = administrationCopy(props.locale);
  if (props.items.length === 0) return <tr><td className={referenceStyles.emptyCell} colSpan={5}>{props.sourceEmpty ? t.noData : t.noMatchingLoadedPage}</td></tr>;
  return <>{props.items.map((item) => <tr key={item.membershipId}>
    <td className={referenceStyles.primary}><bdi dir="ltr">{item.identity.email}</bdi></td>
    <td>{staffRoleLabel(item.role, t)}</td>
    <td><StatusBadge good={item.status === "ACTIVE"}>{staffStatusLabel(item.status, t)}</StatusBadge></td>
    <td>{item.locationAccessCount}</td>
    <td className={referenceStyles.actionCell}><button aria-label={`${t.details}: ${item.identity.email}`} className={referenceStyles.detailAction} onClick={() => props.onSelect(item.membershipId)} type="button"><MoreHorizontal aria-hidden="true" size={18} /></button></td>
  </tr>)}</>;
}

function ShiftRows(props: { readonly items: readonly ActiveShiftOverviewEntry[]; readonly locale: "en" | "ar"; readonly location: NonNullable<ReturnType<typeof selectedStaffLocation>>; readonly onSelect: (item: ActiveShiftOverviewEntry) => void }) {
  const t = administrationCopy(props.locale);
  if (props.items.length === 0) return <tr><td className={referenceStyles.emptyCell} colSpan={5}>{t.noActiveShifts}</td></tr>;
  return <>{props.items.map((item) => <tr key={item.shiftId}>
    <td className={referenceStyles.primary}>{t.activeShift}</td>
    <td><div className={referenceStyles.primary}>{props.location.name}</div><div className={referenceStyles.secondary}><bdi dir="ltr">{props.location.code}</bdi></div></td>
    <td><StatusBadge good>{t.active}</StatusBadge></td>
    <td><bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>{formatStaffTime(item.startedAt, props.location.timezone, props.locale)}</bdi></td>
    <td className={referenceStyles.actionCell}><button aria-label={`${t.details}: ${t.activeShift}`} className={referenceStyles.detailAction} onClick={() => props.onSelect(item)} type="button"><MoreHorizontal aria-hidden="true" size={18} /></button></td>
  </tr>)}</>;
}

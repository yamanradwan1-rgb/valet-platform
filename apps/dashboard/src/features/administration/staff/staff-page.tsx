"use client";

import { MoreHorizontal } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import { administrationScope, administrationScopeKey } from "../administration-scope";
import { AdministrationPage, ReadState, StatusBadge, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { StaffDetailDrawer } from "./staff-detail-drawer";
import { readActiveShifts, readStaffDetail, readStaffDirectory } from "./staff-api";
import { staffRoleLabel, staffStatusLabel } from "./staff-labels";

export function StaffPage() {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  return <StaffPageContent key={scopeKey} />;
}

function StaffPageContent() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
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
  const shiftLocationAvailable = scope.locationId !== null && scope.locationStatus === "ACTIVE";

  const loadDirectory = useCallback((signal: AbortSignal) =>
    readStaffDirectory(dashboard.api, scope.organizationId, directoryCursor, signal),
  [dashboard.api, scope.organizationId, directoryCursor]);
  const directory = useAuthoritativeRead(`${scopeKey}:staff:${directoryCursor ?? "first"}`, loadDirectory, companyAdmin && tab === "employees");
  const loadShifts = useCallback((signal: AbortSignal) => {
    if (!scope.locationId) return Promise.reject(new Error(t.selectLocation));
    if (scope.locationStatus !== "ACTIVE") return Promise.reject(new Error(t.activeLocationRequired));
    return readActiveShifts(dashboard.api, scope.locationId, shiftCursor, signal);
  }, [dashboard.api, scope.locationId, scope.locationStatus, shiftCursor, t.activeLocationRequired, t.selectLocation]);
  const shifts = useAuthoritativeRead(`${scopeKey}:shifts:${shiftCursor ?? "first"}`, loadShifts,
    (companyAdmin || locationManager) && tab === "shifts" && shiftLocationAvailable);
  const loadDetail = useCallback((signal: AbortSignal) => {
    if (!membershipId) return Promise.reject(new Error("No membership selected."));
    return readStaffDetail(dashboard.api, scope.organizationId, membershipId, signal);
  }, [dashboard.api, membershipId, scope.organizationId]);
  const detail = useAuthoritativeRead(`${scopeKey}:staff-detail:${membershipId ?? "none"}`, loadDetail, companyAdmin && membershipId !== null);

  if (!companyAdmin && !locationManager) return null;
  return (
    <AdministrationPage subtitle={t.employeesSubtitle} title={t.employeesTitle}>
      <div className={styles.tabs}>
        {companyAdmin ? <button className={`${styles.tab} ${tab === "employees" ? styles.tabActive : ""}`} onClick={() => setTab("employees")} type="button">{t.employees}</button> : null}
        <button className={`${styles.tab} ${tab === "shifts" ? styles.tabActive : ""}`} onClick={() => setTab("shifts")} type="button">{t.shifts}</button>
      </div>
      {tab === "employees" && companyAdmin ? (
        <ReadState error={directory.error ? new Error(administrationErrorMessage(directory.error)) : null} loading={directory.loading} onRetry={directory.refresh}>
          <div className={styles.card}>
            <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>{t.email}</th><th>{t.role}</th><th>{t.status}</th><th>{t.locationAccess}</th><th>{t.actions}</th></tr></thead>
              <tbody>{directory.data?.items.map((item) => (
                <tr key={item.membershipId}>
                  <td><bdi dir="ltr">{item.identity.email}</bdi></td><td>{staffRoleLabel(item.role, t)}</td>
                  <td><StatusBadge good={item.status === "ACTIVE"}>{staffStatusLabel(item.status, t)}</StatusBadge></td>
                  <td>{item.locationAccessCount}</td><td><button aria-label={`${t.details}: ${item.identity.email}`} className={styles.quiet} onClick={() => setMembershipId(item.membershipId)} type="button"><MoreHorizontal aria-hidden="true" size={18} /></button></td>
                </tr>
              ))}</tbody>
            </table></div>
            {directory.data?.items.length === 0 ? <div className={styles.empty}>{t.noData}</div> : null}
            <div className={styles.pagination}>
              <button className={styles.secondary} disabled={directoryHistory.length === 0} onClick={() => { const history = [...directoryHistory]; const previous = history.pop() ?? null; setDirectoryHistory(history); setDirectoryCursor(previous); }} type="button">{t.previous}</button>
              <button className={styles.secondary} disabled={!directory.data?.nextCursor} onClick={() => { setDirectoryHistory((history) => [...history, directoryCursor]); setDirectoryCursor(directory.data?.nextCursor ?? null); }} type="button">{t.next}</button>
            </div>
          </div>
        </ReadState>
      ) : null}
      {tab === "shifts" ? (!shiftLocationAvailable ? <div className={`${styles.card} ${styles.empty}`}>{scope.locationId === null ? t.selectLocation : t.activeLocationRequired}</div> : (
        <ReadState error={shifts.error ? new Error(administrationErrorMessage(shifts.error)) : null} loading={shifts.loading} onRetry={shifts.refresh}>
          <div className={styles.card}><div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>{t.membership}</th><th>{t.shiftId}</th><th>{t.startedAt}</th></tr></thead>
            <tbody>{shifts.data?.items.map((item) => <tr key={item.shiftId}><td><bdi dir="ltr">{item.membershipId}</bdi></td><td><bdi dir="ltr">{item.shiftId}</bdi></td><td><bdi dir="ltr">{item.startedAt}</bdi></td></tr>)}</tbody>
          </table></div>{shifts.data?.items.length === 0 ? <div className={styles.empty}>{t.noActiveShifts}</div> : null}
          <div className={styles.pagination}><button className={styles.secondary} disabled={shiftHistory.length === 0} onClick={() => { const history = [...shiftHistory]; const previous = history.pop() ?? null; setShiftHistory(history); setShiftCursor(previous); }} type="button">{t.previous}</button><button className={styles.secondary} disabled={!shifts.data?.nextCursor} onClick={() => { setShiftHistory((history) => [...history, shiftCursor]); setShiftCursor(shifts.data?.nextCursor ?? null); }} type="button">{t.next}</button></div></div>
        </ReadState>
      )) : null}
      {membershipId && detail.data ? <StaffDetailDrawer api={dashboard.api} detail={detail.data}
        onChanged={() => { detail.refresh(); directory.refresh(); }} onClose={() => setMembershipId(null)}
        onConflict={() => { detail.refresh(); directory.refresh(); }} organizationId={scope.organizationId}
        selectedLocationId={scope.locationId} /> : null}
    </AdministrationPage>
  );
}

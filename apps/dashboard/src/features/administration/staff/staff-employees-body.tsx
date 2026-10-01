"use client";

import {
  staffManagementDisplayName,
  STAFF_SEARCH_MAX_LENGTH,
  type StaffManagementRole,
} from "@valet/contracts";
import { MoreHorizontal, Search } from "lucide-react";
import { useCallback } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { ReadState, StatusBadge } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { readStaffDetail, readStaffDirectory } from "./staff-api";
import { StaffCursorControls } from "./staff-cursor-controls";
import { StaffDetailDrawer } from "./staff-detail-drawer";
import { StaffDirectoryLocationFilter } from "./staff-directory-location-filter";
import { staffRoleLabel, staffStatusLabel } from "./staff-labels";
import referenceStyles from "./staff-reference.module.css";
import { useStaffDirectoryQuery } from "./use-staff-directory-query";

const roles: readonly StaffManagementRole[] = [
  "ORG_ADMIN",
  "LOCATION_MANAGER",
  "VALET_SUPERVISOR",
  "VALET_EMPLOYEE",
];

export function StaffEmployeesBody() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const query = useStaffDirectoryQuery();
  const filtersKey = JSON.stringify(query.filters);
  const loadDirectory = useCallback(
    (signal: AbortSignal) =>
      readStaffDirectory(
        dashboard.api,
        scope.organizationId,
        query.cursor,
        signal,
        query.filters,
      ),
    [dashboard.api, scope.organizationId, query.cursor, query.filters],
  );
  const directory = useAuthoritativeRead(
    `${scopeKey}:staff:${filtersKey}:${query.cursor ?? "first"}:${query.generation}`,
    loadDirectory,
  );
  const loadDetail = useCallback(
    (signal: AbortSignal) =>
      readStaffDetail(
        dashboard.api,
        scope.organizationId,
        query.membershipId!,
        signal,
      ),
    [dashboard.api, scope.organizationId, query.membershipId],
  );
  const detail = useAuthoritativeRead(
    `${scopeKey}:staff-detail:${query.membershipId ?? "none"}:${query.generation}`,
    loadDetail,
    query.membershipId !== null,
  );
  const employees = directory.data?.items ?? [];
  return (
    <>
      <div className={referenceStyles.content}>
        <div className={referenceStyles.toolbar}>
          <div className={referenceStyles.controls}>
            <label className={referenceStyles.search}>
              <Search aria-hidden="true" />
              <input
                aria-label={t.searchEmployees}
                maxLength={STAFF_SEARCH_MAX_LENGTH * 2}
                onChange={(event) => query.changeSearch(event.target.value)}
                placeholder={t.searchEmployees}
                type="search"
                value={query.search}
              />
            </label>
            <select
              aria-label={t.role}
              className={`${referenceStyles.select} ${referenceStyles.roleSelect}`}
              onChange={(event) =>
                query.changeFilters({
                  role:
                    event.target.value === "ALL"
                      ? undefined
                      : (event.target.value as StaffManagementRole),
                })
              }
              value={query.filters.role ?? "ALL"}
            >
              <option value="ALL">{t.allRoles}</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {staffRoleLabel(role, t)}
                </option>
              ))}
            </select>
            <select
              aria-label={t.status}
              className={`${referenceStyles.select} ${referenceStyles.statusSelect}`}
              onChange={(event) =>
                query.changeFilters({
                  status:
                    event.target.value === "ALL"
                      ? undefined
                      : (event.target.value as "ACTIVE" | "INACTIVE"),
                })
              }
              value={query.filters.status ?? "ALL"}
            >
              <option value="ALL">{t.allMembershipStatuses}</option>
              <option value="ACTIVE">{t.active}</option>
              <option value="INACTIVE">{t.inactive}</option>
            </select>
            <StaffDirectoryLocationFilter
              organizationId={scope.organizationId}
              scopeKey={scopeKey}
              value={query.filters.locationId}
              onChange={(locationId) => query.changeFilters({ locationId })}
            />
          </div>
          <span aria-hidden="true" className={referenceStyles.scopeNote}>
            &nbsp;
          </span>
        </div>
        <ReadState
          error={
            directory.error
              ? new Error(administrationErrorMessage(directory.error))
              : null
          }
          loading={directory.loading}
          onRetry={directory.refresh}
        >
          <div className={referenceStyles.card}>
            <div className={referenceStyles.tableWrap}>
              <table className={referenceStyles.table}>
                <thead>
                  <tr>
                    <th>{t.employees}</th>
                    <th>{t.role}</th>
                    <th>{t.status}</th>
                    <th>{t.locationAccess}</th>
                    <th className={referenceStyles.actionHeader}>
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr>
                      <td className={referenceStyles.emptyCell} colSpan={5}>
                        {t.noMatchingEmployees}
                      </td>
                    </tr>
                  ) : (
                    employees.map((item) => {
                      const name = staffManagementDisplayName(item.identity);
                      const hasName =
                        item.identity.firstName !== null &&
                        item.identity.lastName !== null;
                      return (
                        <tr key={item.membershipId}>
                          <td>
                            <div className={referenceStyles.primary}>
                              <bdi dir={hasName ? "auto" : "ltr"}>{name}</bdi>
                            </div>
                            {hasName ? (
                              <div className={referenceStyles.secondary}>
                                <bdi dir="ltr">{item.identity.email}</bdi>
                              </div>
                            ) : null}
                          </td>
                          <td>{staffRoleLabel(item.role, t)}</td>
                          <td>
                            <StatusBadge good={item.status === "ACTIVE"}>
                              {staffStatusLabel(item.status, t)}
                            </StatusBadge>
                          </td>
                          <td>{item.locationAccessCount}</td>
                          <td className={referenceStyles.actionCell}>
                            <button
                              aria-label={`${t.details}: ${name}`}
                              className={referenceStyles.detailAction}
                              onClick={() => query.select(item.membershipId)}
                              type="button"
                            >
                              <MoreHorizontal aria-hidden="true" size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <StaffCursorControls
              canNext={Boolean(directory.data?.nextCursor)}
              canPrevious={query.history.length > 0}
              label={t.loadedCursorPage}
              loading={directory.loading}
              locale={locale}
              onNext={() => {
                if (directory.data?.nextCursor)
                  query.next(directory.data.nextCursor);
              }}
              onPrevious={query.previous}
            />
          </div>
        </ReadState>
      </div>
      {query.membershipId && detail.data ? (
        <StaffDetailDrawer
          api={dashboard.api}
          detail={detail.data}
          onChanged={() => {
            detail.refresh();
            directory.refresh();
          }}
          onClose={() => query.select(null)}
          onConflict={() => {
            detail.refresh();
            directory.refresh();
          }}
          organizationId={scope.organizationId}
          selectedLocationId={scope.locationId}
        />
      ) : null}
    </>
  );
}

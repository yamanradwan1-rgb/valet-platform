"use client";

import { MapPin, Shield, User, Users } from "lucide-react";
import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import { administrationErrorMessage } from "../administration-error";
import { administrationScope, administrationScopeKey } from "../administration-scope";
import { AdministrationPage, ReadState, StatusBadge, styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { readStaffDirectory } from "../staff/staff-api";

export function RolesPage() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [tab, setTab] = useState<"roles" | "users">("roles");
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const loadUsers = useCallback(
    (signal: AbortSignal) => readStaffDirectory(dashboard.api, scope.organizationId, cursor, signal),
    [cursor, dashboard.api, scope.organizationId],
  );
  const users = useAuthoritativeRead(
    `${scopeKey}:roles-users:${cursor ?? "first"}`,
    loadUsers,
    scope.authority === "COMPANY_ADMIN" && tab === "users",
  );
  if (scope.authority !== "COMPANY_ADMIN") return null;
  const roles = [
    { code: "ORG_ADMIN", label: t.companyAdmin, icon: Shield, iconClass: styles.roleIconAdmin, description: locale === "ar" ? "إدارة الشركة والموظفين والإعدادات ضمن حدود العقد." : "Company administration, staff authority, and configuration within the accepted contract." },
    { code: "LOCATION_MANAGER", label: t.locationManager, icon: MapPin, iconClass: styles.roleIconManager, description: locale === "ar" ? "إدارة الإعدادات والهوية المعتمدة للمواقع الممنوحة فقط." : "Accepted configuration and branding for explicitly granted Locations." },
    { code: "VALET_SUPERVISOR", label: t.supervisor, icon: Users, iconClass: styles.roleIconSupervisor, description: locale === "ar" ? "دور تشغيلي للوردية؛ لا يملك صفحات إدارة MD-02." : "Operational shift role; it has no MD-02 administration authority." },
    { code: "VALET_EMPLOYEE", label: t.employee, icon: User, iconClass: styles.roleIconEmployee, description: locale === "ar" ? "دور تشغيلي ميداني؛ لا يملك صفحات إدارة MD-02." : "Field operations role; it has no MD-02 administration authority." },
  ] as const;
  return <AdministrationPage subtitle={t.rolesSubtitle} title={t.rolesTitle}>
    <div className={styles.card}>
      <div className={`${styles.tabs} ${styles.tabsInset}`}>
        <button className={`${styles.tab} ${tab === "roles" ? styles.tabActive : ""}`} onClick={() => setTab("roles")} type="button">{t.fixedRoles}</button>
        <button className={`${styles.tab} ${tab === "users" ? styles.tabActive : ""}`} onClick={() => setTab("users")} type="button">{t.users}</button>
      </div>
      {tab === "roles" ? (
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{t.role}</th><th>{t.users}</th><th>{t.description}</th><th>{t.actions}</th></tr></thead><tbody>
          {roles.map((role) => {
            const Icon = role.icon;
            return <tr key={role.code}>
              <td><div className={styles.actions}><span className={`${styles.roleIcon} ${role.iconClass}`}><Icon aria-hidden="true" size={16} /></span><div><div className={styles.strong}>{role.label}</div><bdi className={styles.muted} dir="ltr">{role.code}</bdi></div></div></td>
              <td aria-label={locale === "ar" ? "الإجمالي غير متاح" : "Total unavailable"}>—</td>
              <td>{role.description}</td>
              <td aria-label={locale === "ar" ? "لا توجد إجراءات" : "No actions"}>—</td>
            </tr>;
          })}
        </tbody></table></div>
      ) : (
        <ReadState error={users.error ? new Error(administrationErrorMessage(users.error)) : null} loading={users.loading} onRetry={users.refresh}>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>{t.email}</th><th>{t.role}</th><th>{t.locationAccess}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead><tbody>
            {users.data?.items.map((item) => <tr key={item.membershipId}>
              <td><bdi dir="ltr">{item.identity.email}</bdi></td>
              <td>{roleLabel(item.role, t)}</td>
              <td>{item.locationAccessCount}</td>
              <td><StatusBadge good={item.status === "ACTIVE"}>{item.status === "ACTIVE" ? t.active : t.inactive}</StatusBadge></td>
              <td aria-label={locale === "ar" ? "تتم إدارة الصلاحيات من صفحة الموظفين" : "Authority is managed from Employees"}>—</td>
            </tr>)}
          </tbody></table></div>
          {users.data?.items.length === 0 ? <div className={styles.empty}>{t.noData}</div> : null}
          <div className={styles.pagination}>
            <button className={styles.secondary} disabled={history.length === 0} onClick={() => {
              const previousHistory = [...history];
              const previous = previousHistory.pop() ?? null;
              setHistory(previousHistory);
              setCursor(previous);
            }} type="button">{t.previous}</button>
            <button className={styles.secondary} disabled={!users.data?.nextCursor} onClick={() => {
              setHistory((items) => [...items, cursor]);
              setCursor(users.data?.nextCursor ?? null);
            }} type="button">{t.next}</button>
          </div>
        </ReadState>
      )}
    </div>
  </AdministrationPage>;
}

function roleLabel(
  role: "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR" | "VALET_EMPLOYEE",
  t: ReturnType<typeof administrationCopy>,
): string {
  if (role === "ORG_ADMIN") return t.companyAdmin;
  if (role === "LOCATION_MANAGER") return t.locationManager;
  if (role === "VALET_SUPERVISOR") return t.supervisor;
  return t.employee;
}

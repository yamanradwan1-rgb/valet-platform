"use client";

import { MapPin, Shield, User, Users } from "lucide-react";
import type { StaffManagementRole } from "@valet/contracts";

import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { ReferenceAdministrationPage as AdministrationPage } from "../reference-administration-page";
import { administrationCopy } from "../administration-copy";
import { styles } from "../administration-ui";
import { fixedRoleReference, roleReferenceCopy } from "./role-reference";

const roleIcons = {
  ORG_ADMIN: { icon: Shield, className: styles.roleIconAdmin },
  LOCATION_MANAGER: { icon: MapPin, className: styles.roleIconManager },
  VALET_SUPERVISOR: { icon: Users, className: styles.roleIconSupervisor },
  VALET_EMPLOYEE: { icon: User, className: styles.roleIconEmployee },
} satisfies Record<StaffManagementRole, unknown>;

export function RolesPage() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const reference = roleReferenceCopy(locale);
  if (dashboard.selectedScope.authority !== "COMPANY_ADMIN") return null;

  return (
    <AdministrationPage
      subtitle={t.rolesSubtitle}
      subtitleMargin="half"
      subtitleSize="sm"
      title={t.rolesTitle}
    >
      <p className={styles.subtitle}>{reference.explanation}</p>
      <div className={styles.card}>
        <div
          aria-label={t.fixedRoles}
          className={styles.tableWrap}
          role="region"
          tabIndex={0}
        >
          <table className={`${styles.table} ${styles.referenceTable}`}>
            <thead>
              <tr>
                <th>{t.role}</th>
                <th>{reference.scope}</th>
                <th>{reference.capabilities}</th>
                <th>{reference.conditions}</th>
              </tr>
            </thead>
            <tbody>
              {fixedRoleReference(locale).map((role) => {
                const { icon: Icon, className } = roleIcons[role.role];
                return (
                  <tr key={role.role}>
                    <td>
                      <div className={styles.roleCell}>
                        <span className={`${styles.roleIcon} ${className}`}>
                          <Icon aria-hidden="true" size={16} />
                        </span>
                        <div className={styles.strong}>{role.label}</div>
                      </div>
                    </td>
                    <td>{role.scope}</td>
                    <td>{role.capabilities}</td>
                    <td>{role.conditions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdministrationPage>
  );
}

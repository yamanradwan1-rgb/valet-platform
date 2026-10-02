"use client";
import { useCallback, useEffect, useState } from "react";
import { useStaffAuth } from "../../../lib/auth/staff-auth-context";
import {
  clearForceEndRecovery,
  readForceEndRecovery,
  subscribeForceEndRecovery,
  forceEndRecoveryScope,
  type ForceEndRecovery,
} from "./staff-force-end-recovery";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationCopy } from "../administration-copy";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { AdministrationPage, styles } from "../administration-ui";
import { StaffEmployeesBody } from "./staff-employees-body";
import { StaffShiftsBody } from "./staff-shifts-body";
import { staffShiftHistoryCopy } from "./staff-shift-history-copy";
import css from "./staff-reference.module.css";
export function StaffPage() {
  const dashboard = useProtectedDashboard();
  const { client: auth } = useStaffAuth();
  const [recovery, setRecovery] = useState(() =>
    readForceEndRecovery(dashboard),
  );
  useEffect(() => {
    let disposed = false;
    const accept = () => {
      queueMicrotask(() => {
        if (
          disposed ||
          auth.getIdentityGeneration() !== dashboard.identityGeneration ||
          auth.getSessionGeneration() !== dashboard.sessionGeneration
        )
          return;
        const value = readForceEndRecovery(dashboard);
        if (value) {
          setRecovery(value);
          clearForceEndRecovery(value);
        }
      });
    };
    const unsubscribe = subscribeForceEndRecovery(accept);
    accept();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [dashboard, auth]);
  const current =
    recovery?.scope === forceEndRecoveryScope(dashboard) &&
    recovery.sessionGeneration === dashboard.sessionGeneration
      ? recovery
      : null;
  return (
    <StaffPageContent
      key={`${administrationScopeKey(dashboard)}:${current?.operationId ?? "normal"}`}
      recovery={current}
    />
  );
}
function StaffPageContent(props: {
  readonly recovery: ForceEndRecovery | null;
}) {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [recovery, setRecovery] = useState(props.recovery);
  const consumeRecovery = useCallback(() => setRecovery(null), []);
  const companyAdmin = scope.authority === "COMPANY_ADMIN",
    locationManager = scope.authority === "LOCATION_MANAGER";
  const [tab, setTab] = useState<"employees" | "shifts">(
    companyAdmin && !recovery ? "employees" : "shifts",
  );
  if (!companyAdmin && !locationManager) return null;
  return (
    <AdministrationPage
      subtitle={
        tab === "shifts"
          ? staffShiftHistoryCopy(locale).subtitle
          : companyAdmin
            ? t.employeesSubtitle
            : t.employeesLocationManagerStaffSubtitle
      }
      subtitleSize="sm"
      title={t.employeesTitle}
      titleTracking="tight"
    >
      <div className={`${styles.tabs} ${styles.staffTabs} ${css.tabsOffset}`}>
        {(["employees", "shifts"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={tab === value}
            className={`${styles.tab} ${styles.staffTab} ${tab === value ? `${styles.tabActive} ${styles.staffTabActive}` : ""}`}
            onClick={() => setTab(value)}
            type="button"
          >
            {value === "employees" ? t.employees : t.shifts}
          </button>
        ))}
      </div>
      {tab === "employees" ? (
        <StaffEmployeesBody />
      ) : (
        <StaffShiftsBody
          recovery={recovery}
          onRecoveryConsumed={consumeRecovery}
        />
      )}
    </AdministrationPage>
  );
}

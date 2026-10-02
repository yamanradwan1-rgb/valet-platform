"use client";
import { useState } from "react";
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
  return <StaffPageContent key={administrationScopeKey(dashboard)} />;
}
function StaffPageContent() {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const companyAdmin = scope.authority === "COMPANY_ADMIN",
    locationManager = scope.authority === "LOCATION_MANAGER";
  const [tab, setTab] = useState<"employees" | "shifts">(
    companyAdmin ? "employees" : "shifts",
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
      {tab === "employees" ? <StaffEmployeesBody /> : <StaffShiftsBody />}
    </AdministrationPage>
  );
}

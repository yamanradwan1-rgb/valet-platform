import { Moon, Sun } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { DashboardShell } from "../../../../apps/dashboard/src/components/shell/dashboard-shell";
import { dashboardNavigationRegistrations } from "../../../../apps/dashboard/src/lib/navigation/dashboard-navigation";
import { ar as arabicLabels, en as englishLabels } from "../../../../apps/dashboard/src/lib/i18n/dictionaries";
import { DashboardThemeProvider } from "../../../../apps/dashboard/src/lib/theme/theme-provider";
import { commitDashboardTheme } from "../../../../apps/dashboard/src/lib/theme/theme";
import type { PrototypeLocale, PrototypeRole, PrototypeTheme } from "../types/variant";

interface Props {
  readonly locale: PrototypeLocale;
  readonly theme: PrototypeTheme;
  readonly role: PrototypeRole;
  readonly organization: string;
  readonly location: string | null;
  readonly onLocaleChange: (locale: PrototypeLocale) => void;
  readonly onThemeChange: (theme: PrototypeTheme) => void;
  readonly onSelectLocation: () => void;
  readonly children: ReactNode;
}

export function ProductionDashboardShell(props: Props) {
  const ar = props.locale === "ar";
  useEffect(() => commitDashboardTheme(props.theme), [props.theme]);
  const navigation = dashboardNavigationRegistrations.filter(registration =>
    registration.availability === "IMPLEMENTED" &&
    // The W1 synthetic CA browser fixture does not grant these two features.
    registration.id !== "visit-contacts" && registration.id !== "management-audit" &&
    registration.roles.includes(props.role as "COMPANY_ADMIN" | "LOCATION_MANAGER") &&
    (registration.scopeRequirement !== "LOCATION" || props.location !== null),
  ).map(registration => ({
    id: registration.id,
    owner: registration.owner,
    href: registration.href,
    label: registration.labels[props.locale],
    icon: registration.icon,
    placement: registration.placement,
  }));
  const labels = ar ? arabicLabels : englishLabels;
  return <DashboardThemeProvider><DashboardShell
    accountControl={<button className="button button-quiet" type="button" onClick={() => window.alert(ar ? "هذه محاكاة ولا توجد جلسة حقيقية." : "Prototype only; there is no authenticated session.")}>{labels.logout}</button>}
    currentPath="/policies" labels={labels}
    localeControl={<button className="button button-quiet" type="button"
      aria-label={ar ? "اللغة" : "Language"}
      onClick={() => props.onLocaleChange(ar ? "en" : "ar")}>{ar ? "EN" : "AR"}</button>}
    themeControl={<div className="theme-segmented" role="group" aria-label={ar ? "السمة" : "Theme"}>
      <button type="button" className="theme-segment" aria-pressed={props.theme === "light"} aria-label={ar ? "فاتح" : "Light"}
        onClick={() => props.onThemeChange("light")}><Sun aria-hidden="true" size={15}/><span>{ar ? "فاتح" : "Light"}</span></button>
      <button type="button" className="theme-segment" aria-pressed={props.theme === "dark"} aria-label={ar ? "داكن" : "Dark"}
        onClick={() => props.onThemeChange("dark")}><Moon aria-hidden="true" size={15}/><span>{ar ? "داكن" : "Dark"}</span></button>
    </div>}
    navigationItems={navigation}
    onLocationSelect={props.onSelectLocation}
    onOrganizationSelect={props.onSelectLocation}
    selectedOrganization={{ id: "prototype-organization", label: props.organization }}
    selectedLocation={{ id: "prototype-location", label: props.location ?? (ar ? "كل المواقع" : "All Locations") }}
  >{props.children}</DashboardShell></DashboardThemeProvider>;
}

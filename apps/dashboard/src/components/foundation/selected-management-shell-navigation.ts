import {
  dashboardNavigationRegistrations,
  resolveNavigation,
} from "../../lib/navigation";
import { reconcileAccountSecurityNavigation } from "../../lib/navigation/account-security-navigation";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { navigationForLocationStatus } from "../scope/location-switch-policy";
import type { SelectedDashboardScope } from "../scope";
import { selectedScopePresentation } from "./scope-presentation";
import { selectedManagementLocationStatus } from "./selected-management-shell-policy";
import type { NavigationAuthorityState } from "./use-navigation-authority";

export function selectedManagementShellNavigation(input: {
  readonly selectedScope: SelectedDashboardScope;
  readonly navigationAuthority: NavigationAuthorityState;
  readonly locale: DashboardLocale;
  readonly securityEligible: boolean;
  readonly allLocationsLabel: string;
  readonly locationsLabel: string;
}) {
  const { selectedScope, navigationAuthority, locale } = input;
  const presentation = selectedScopePresentation(selectedScope);
  const resolvedNavigation =
    navigationAuthority.status === "valid"
      ? navigationForLocationStatus(
          resolveNavigation(
            dashboardNavigationRegistrations,
            presentation.navigation,
            locale,
            navigationAuthority.authority,
          ),
          selectedManagementLocationStatus(selectedScope),
          selectedScope.authority === "COMPANY_ADMIN",
        )
      : [];
  const navigation = reconcileAccountSecurityNavigation(
    dashboardNavigationRegistrations,
    resolvedNavigation,
    locale,
    input.securityEligible,
  );
  const selectedLocation =
    presentation.location ??
    (selectedScope.authority === "COMPANY_ADMIN" &&
    selectedScope.context.scope.kind === "ALL_LOCATIONS"
      ? { id: "all-locations", label: input.allLocationsLabel }
      : selectedScope.authority === "LOCATION_MANAGER_GRANT_SET"
        ? { id: "location-grant-set", label: input.locationsLabel }
        : null);
  return { presentation, navigation, selectedLocation };
}

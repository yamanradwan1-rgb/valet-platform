import type { DashboardNavigationContext } from "../../lib/navigation";
import type { DashboardScopeReference } from "../shell";
import type { SelectedDashboardScope } from "../scope";

export interface SelectedScopePresentation {
  readonly navigation: DashboardNavigationContext;
  readonly organization: DashboardScopeReference;
  readonly location: DashboardScopeReference | null;
}

export function selectedScopePresentation(
  scope: SelectedDashboardScope,
): SelectedScopePresentation {
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return {
      navigation: {
        role: "COMPANY_ADMIN",
        organizationId: scope.organization.organizationId,
        locationId: null,
      },
      organization: {
        id: scope.organization.organizationId,
        label: scope.organization.name,
      },
      location: null,
    };
  }
  if (scope.authority === "COMPANY_ADMIN") {
    return {
      navigation: {
        role: "COMPANY_ADMIN",
        organizationId: scope.context.organization.organizationId,
        locationId: scope.context.selectedLocation?.locationId ?? null,
      },
      organization: {
        id: scope.context.organization.organizationId,
        label: scope.context.organization.name,
      },
      location:
        scope.context.selectedLocation === null
          ? null
          : {
              id: scope.context.selectedLocation.locationId,
              label: scope.context.selectedLocation.name,
            },
    };
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return {
      navigation: {
        role: "LOCATION_MANAGER",
        organizationId: scope.organization.organizationId,
        locationId: scope.location.locationId,
      },
      organization: {
        id: scope.organization.organizationId,
        label: scope.organization.name,
      },
      location: { id: scope.location.locationId, label: scope.location.name },
    };
  }
  return {
    navigation: {
      role: "SUPERVISOR",
      organizationId: scope.context.organization.organizationId,
      locationId: scope.context.location.locationId,
    },
    organization: {
      id: scope.context.organization.organizationId,
      label: scope.context.organization.name,
    },
    location: {
      id: scope.context.location.locationId,
      label: scope.context.location.name,
    },
  };
}

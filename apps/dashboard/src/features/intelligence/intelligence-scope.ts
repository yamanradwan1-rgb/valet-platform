import type { SelectedDashboardScope } from "../../components/scope";

export type IntelligenceScope =
  | {
      readonly kind: "COMPANY";
      readonly organizationId: string;
    }
  | {
      readonly kind: "LOCATION";
      readonly organizationId: string;
      readonly locationId: string;
    };

/**
 * Maps the already-revalidated Foundation selection into the MD-05 read scope.
 * This never replaces server authorization; every adapter still performs an
 * authenticated backend request.
 */
export function intelligenceScope(
  selectedScope: SelectedDashboardScope,
): IntelligenceScope | null {
  if (selectedScope.authority === "COMPANY_ADMIN") {
    const organizationId = selectedScope.context.organization.organizationId;
    if (selectedScope.context.scope.kind === "ALL_LOCATIONS") {
      return { kind: "COMPANY", organizationId };
    }
    const selectedLocation = selectedScope.context.selectedLocation;
    if (
      selectedLocation === null ||
      selectedLocation.status !== "ACTIVE" ||
      selectedLocation.locationId !== selectedScope.context.scope.locationId
    ) {
      return null;
    }
    return {
      kind: "LOCATION",
      locationId: selectedLocation.locationId,
      organizationId,
    };
  }

  if (
    selectedScope.authority === "LOCATION_MANAGER" &&
    selectedScope.location.status === "ACTIVE"
  ) {
    return {
      kind: "LOCATION",
      locationId: selectedScope.location.locationId,
      organizationId: selectedScope.organization.organizationId,
    };
  }

  return null;
}

export type LocationAnalyticsEndpointFamily =
  | "LOCATION_OPERATIONS"
  | "LOCATION_FINANCIAL_ANALYTICS"
  | "LOCATION_INCIDENTS"
  | "LOCATION_KPIS";

export function intelligenceAnalyticsEndpointFamily(
  scope: IntelligenceScope,
  locationFamily: LocationAnalyticsEndpointFamily,
): LocationAnalyticsEndpointFamily | "COMPANY_ANALYTICS" {
  return scope.kind === "COMPANY" ? "COMPANY_ANALYTICS" : locationFamily;
}

export function intelligenceReportEndpointFamily(
  scope: IntelligenceScope,
): "COMPANY_REPORT" | "LOCATION_REPORT" {
  return scope.kind === "COMPANY" ? "COMPANY_REPORT" : "LOCATION_REPORT";
}

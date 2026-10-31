import type { SelectedDashboardScope } from "../../../../../components/scope";
import { selectedScopeAuthorityKey } from "../../../../../components/foundation/selected-scope-revalidation-policy";

/** Route eligibility only; API capabilities and persisted authorization still rule. */
export type PresenceStudioAccess =
  | "REQUESTABLE"
  | "NO_LOCATION"
  | "INACTIVE_LOCATION"
  | "DENIED";

export function presenceStudioAccess(
  scope: SelectedDashboardScope,
  company: boolean,
): PresenceStudioAccess {
  if (company) return scope.authority === "COMPANY_ADMIN"
    ? "REQUESTABLE" : "DENIED";
  if (scope.authority === "COMPANY_ADMIN") {
    const location = scope.context.selectedLocation;
    if (!location) return "NO_LOCATION";
    return location.status === "ACTIVE" ? "REQUESTABLE" : "INACTIVE_LOCATION";
  }
  if (scope.authority === "LOCATION_MANAGER")
    return scope.location.status === "ACTIVE"
      ? "REQUESTABLE" : "INACTIVE_LOCATION";
  return "DENIED";
}

export function presenceStudioScopeKey(input: {
  readonly sessionGeneration: number;
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope;
}, company: boolean): string {
  return [
    input.sessionGeneration,
    input.identityGeneration,
    input.selectionRevision,
    selectedScopeAuthorityKey(input.selectedScope),
    company ? "company" : "location",
  ].join(":");
}

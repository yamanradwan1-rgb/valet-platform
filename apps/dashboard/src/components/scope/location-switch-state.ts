import type { SelectedScopeEpoch } from "../foundation/selected-scope-state";
import { selectedScopeAuthorityKey } from "../foundation/selected-scope-revalidation-policy";
import type {
  LocationSwitchCandidate,
  LocationSwitchSourceScope,
  SwitchableDashboardScope,
} from "./location-switch-authority";

export interface LocationSwitchTicket extends SelectedScopeEpoch {
  readonly currentPath: string;
  readonly requestGeneration: number;
  readonly scopeKey: string;
}

export type LocationSwitchMenuStatus = "idle" | "loading" | "ready" | "error";

export interface PendingLocationSelection {
  readonly generation: number;
  readonly key: string;
}

export function candidateKey(candidate: LocationSwitchCandidate): string {
  return candidate.kind === "ALL_LOCATIONS"
    ? "all-locations"
    : `location:${candidate.location.locationId}`;
}

export function selectedLocationKey(scope: SwitchableDashboardScope): string {
  if (scope.authority === "LOCATION_MANAGER") {
    return `location:${scope.location.locationId}`;
  }
  return scope.context.scope.kind === "ALL_LOCATIONS"
    ? "all-locations"
    : `location:${scope.context.scope.locationId}`;
}

export function sourceSelectedLocationKey(
  scope: LocationSwitchSourceScope,
): string {
  return scope.authority === "LOCATION_MANAGER_GRANT_SET"
    ? "grant-set"
    : selectedLocationKey(scope);
}

export function organizationIdForSwitch(
  scope: LocationSwitchSourceScope,
): string {
  return scope.authority === "COMPANY_ADMIN"
    ? scope.context.organization.organizationId
    : scope.organization.organizationId;
}

export function locationSwitchRequestKey(
  ticket: LocationSwitchTicket,
  key: string,
): string {
  return [
    "location-switch",
    ticket.identityGeneration,
    ticket.sessionGeneration,
    ticket.selectionRevision,
    ticket.scopeKey,
    ticket.currentPath,
    ticket.requestGeneration,
    key,
  ].join(":");
}

export function switchScopeKey(scope: LocationSwitchSourceScope): string {
  return selectedScopeAuthorityKey(scope);
}

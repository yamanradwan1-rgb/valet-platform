import type { SelectedDashboardScope } from "../../components/scope";

export interface VisitContactScope {
  readonly organizationId: string;
  readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER";
}

export function visitContactScope(
  selected: SelectedDashboardScope,
): VisitContactScope | null {
  if (
    selected.authority === "COMPANY_ADMIN" &&
    selected.context.scope.kind === "ALL_LOCATIONS"
  ) {
    return {
      organizationId: selected.context.organization.organizationId,
      role: "COMPANY_ADMIN",
    };
  }
  if (selected.authority === "LOCATION_MANAGER_GRANT_SET") {
    return {
      organizationId: selected.organization.organizationId,
      role: "LOCATION_MANAGER",
    };
  }
  return null;
}

export function visitContactScopeKey(input: {
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope;
  readonly sessionGeneration: number;
}): string {
  const scope = visitContactScope(input.selectedScope);
  return [
    input.identityGeneration,
    input.sessionGeneration,
    input.selectionRevision,
    "VISIT_CONTACTS",
    scope?.role ?? "denied",
    scope?.organizationId ?? "none",
  ].join(":");
}

export function visitContactIntentScopeKey(input: {
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope;
}): string {
  const scope = visitContactScope(input.selectedScope);
  return [
    input.identityGeneration,
    input.selectionRevision,
    "VISIT_CONTACT_CORRECTION_INTENT",
    scope?.role ?? "denied",
    scope?.organizationId ?? "none",
  ].join(":");
}

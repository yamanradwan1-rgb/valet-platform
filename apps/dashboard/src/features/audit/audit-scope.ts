import type { SelectedDashboardScope } from "../../components/scope";

export type AuditScope =
  | {
      readonly kind: "ORGANIZATION";
      readonly organizationId: string;
      readonly role: "COMPANY_ADMIN";
    }
  | {
      readonly kind: "LOCATION";
      readonly locationId: string;
      readonly organizationId: string;
      readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";
    };

export function auditScope(selected: SelectedDashboardScope): AuditScope | null {
  if (selected.authority === "COMPANY_ADMIN") {
    if (selected.context.scope.kind === "ALL_LOCATIONS") {
      return {
        kind: "ORGANIZATION",
        organizationId: selected.context.organization.organizationId,
        role: "COMPANY_ADMIN",
      };
    }
    return {
      kind: "LOCATION",
      locationId: selected.context.scope.locationId,
      organizationId: selected.context.organization.organizationId,
      role: "COMPANY_ADMIN",
    };
  }
  if (selected.authority === "LOCATION_MANAGER") {
    return {
      kind: "LOCATION",
      locationId: selected.location.locationId,
      organizationId: selected.organization.organizationId,
      role: "LOCATION_MANAGER",
    };
  }
  if (selected.authority === "SUPERVISOR") {
    return {
      kind: "LOCATION",
      locationId: selected.context.location.locationId,
      organizationId: selected.context.organization.organizationId,
      role: "SUPERVISOR",
    };
  }
  return null;
}

export function auditScopeKey(input: {
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope;
  readonly sessionGeneration: number;
}): string {
  const scope = auditScope(input.selectedScope);
  return [
    input.identityGeneration,
    input.sessionGeneration,
    input.selectionRevision,
    "MANAGEMENT_AUDIT",
    scope?.role ?? "denied",
    scope?.organizationId ?? "none",
    scope?.kind ?? "none",
    scope?.kind === "LOCATION" ? scope.locationId : "no-location",
  ].join(":");
}

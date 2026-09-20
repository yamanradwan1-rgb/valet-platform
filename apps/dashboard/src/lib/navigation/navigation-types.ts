export type DashboardNavigationRole =
  "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";

export type DashboardNavigationAvailability = "IMPLEMENTED" | "PLANNED";

export type DashboardNavigationScopeRequirement =
  "NONE" | "ORGANIZATION" | "LOCATION";

export interface DashboardNavigationRegistration<
  LabelKey extends string = string,
> {
  readonly id: string;
  readonly owner: `MD-${string}`;
  readonly href: string;
  readonly labelKey: LabelKey;
  readonly roles: readonly DashboardNavigationRole[];
  readonly scopeRequirement: DashboardNavigationScopeRequirement;
  readonly availability: DashboardNavigationAvailability;
}

export interface DashboardNavigationContext {
  readonly role: DashboardNavigationRole;
  readonly organizationId: string | null;
  readonly locationId: string | null;
}

export interface DashboardNavigationItem {
  readonly id: string;
  readonly owner: `MD-${string}`;
  readonly href: string;
  readonly label: string;
}

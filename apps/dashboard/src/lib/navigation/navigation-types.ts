import type { LucideIcon } from "lucide-react";

import type { DashboardLocale } from "../i18n/locale";
import type { DashboardRouteAccessRequirement } from "../scope/dashboard-commercial-access";

export type DashboardNavigationRole =
  "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";

export type DashboardNavigationAvailability = "IMPLEMENTED" | "PLANNED";

export type DashboardNavigationScopeRequirement =
  "NONE" | "ORGANIZATION" | "LOCATION";

export type DashboardNavigationPlacement = "MAIN" | "UTILITY";

export type DashboardNavigationLabels = Readonly<Record<DashboardLocale, string>>;

export interface DashboardNavigationRegistration {
  readonly id: string;
  readonly owner: `MD-${string}`;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly labels: DashboardNavigationLabels;
  readonly roles: readonly DashboardNavigationRole[];
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly scopeRequirement: DashboardNavigationScopeRequirement;
  readonly availability: DashboardNavigationAvailability;
  readonly placement: DashboardNavigationPlacement;
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
  readonly icon: LucideIcon;
  readonly label: string;
  readonly placement: DashboardNavigationPlacement;
}

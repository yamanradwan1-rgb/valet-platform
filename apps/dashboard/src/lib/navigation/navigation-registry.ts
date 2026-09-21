import type { DashboardLocale } from "../i18n/locale";
import {
  allowsDashboardRouteAccessRequirement,
  type DashboardRouteAccess,
} from "../scope/dashboard-commercial-access";
import type {
  DashboardNavigationContext,
  DashboardNavigationItem,
  DashboardNavigationRegistration,
} from "./navigation-types";

export function defineNavigationDestination(
  registration: DashboardNavigationRegistration,
): DashboardNavigationRegistration {
  return registration;
}

export function composeNavigationRegistry(
  ...groups: ReadonlyArray<readonly DashboardNavigationRegistration[]>
): readonly DashboardNavigationRegistration[] {
  const registrations = groups.flat();
  const ids = new Set<string>();
  const hrefs = new Set<string>();

  for (const registration of registrations) {
    if (registration.roles.length === 0) {
      throw new Error(
        `Navigation destination ${registration.id} has no allowed roles.`,
      );
    }
    if (ids.has(registration.id)) {
      throw new Error(
        `Duplicate navigation destination id: ${registration.id}`,
      );
    }
    if (hrefs.has(registration.href)) {
      throw new Error(
        `Duplicate navigation destination href: ${registration.href}`,
      );
    }
    ids.add(registration.id);
    hrefs.add(registration.href);
  }

  return registrations;
}

export function isNavigationPathActive(
  currentPath: string,
  destinationHref: string,
): boolean {
  if (destinationHref === "/") return currentPath === "/";
  return (
    currentPath === destinationHref ||
    currentPath.startsWith(`${destinationHref}/`)
  );
}

function hasRequiredScope(
  registration: DashboardNavigationRegistration,
  context: DashboardNavigationContext,
): boolean {
  if (registration.scopeRequirement === "NONE") return true;
  if (registration.scopeRequirement === "ORGANIZATION") {
    return context.organizationId !== null;
  }
  return context.organizationId !== null && context.locationId !== null;
}

export function resolveNavigation(
  registrations: readonly DashboardNavigationRegistration[],
  context: DashboardNavigationContext,
  locale: DashboardLocale,
  routeAccess: DashboardRouteAccess,
): readonly DashboardNavigationItem[] {
  return registrations
    .filter((registration) => registration.availability === "IMPLEMENTED")
    .filter((registration) => registration.roles.includes(context.role))
    .filter((registration) => hasRequiredScope(registration, context))
    .filter((registration) =>
      allowsDashboardRouteAccessRequirement(
        registration.accessRequirement,
        routeAccess,
      ))
    .map((registration) => ({
      href: registration.href,
      icon: registration.icon,
      id: registration.id,
      label: registration.labels[locale],
      owner: registration.owner,
      placement: registration.placement,
    }));
}

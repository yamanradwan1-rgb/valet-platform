import type {
  DashboardNavigationContext,
  DashboardNavigationItem,
  DashboardNavigationRegistration,
} from "./navigation-types";

export function defineNavigationDestination<LabelKey extends string>(
  registration: DashboardNavigationRegistration<LabelKey>,
): DashboardNavigationRegistration<LabelKey> {
  return registration;
}

export function composeNavigationRegistry<LabelKey extends string>(
  ...groups: ReadonlyArray<readonly DashboardNavigationRegistration<LabelKey>[]>
): readonly DashboardNavigationRegistration<LabelKey>[] {
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

export function resolveNavigation<LabelKey extends string>(
  registrations: readonly DashboardNavigationRegistration<LabelKey>[],
  context: DashboardNavigationContext,
  translate: (key: LabelKey) => string,
): readonly DashboardNavigationItem[] {
  return registrations
    .filter((registration) => registration.availability === "IMPLEMENTED")
    .filter((registration) => registration.roles.includes(context.role))
    .filter((registration) => hasRequiredScope(registration, context))
    .map((registration) => ({
      href: registration.href,
      id: registration.id,
      label: translate(registration.labelKey),
      owner: registration.owner,
    }));
}

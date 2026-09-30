import type { DashboardLocale } from "../i18n/locale";
import type {
  DashboardNavigationItem,
  DashboardNavigationRegistration,
} from "./navigation-types";

function itemFromRegistration(
  registration: DashboardNavigationRegistration,
  locale: DashboardLocale,
): DashboardNavigationItem {
  return {
    href: registration.href,
    icon: registration.icon,
    id: registration.id,
    label: registration.labels[locale],
    owner: registration.owner,
    placement: registration.placement,
  };
}

export function navigationItemsFromPresentationIds(
  registrations: readonly DashboardNavigationRegistration[],
  destinationIds: readonly string[],
  locale: DashboardLocale,
): readonly DashboardNavigationItem[] {
  const ids = new Set(destinationIds);
  return registrations
    .filter((registration) => registration.availability === "IMPLEMENTED")
    .filter((registration) => ids.has(registration.id))
    .map((registration) => itemFromRegistration(registration, locale));
}

export function reconcileAccountSecurityNavigation(
  registrations: readonly DashboardNavigationRegistration[],
  navigation: readonly DashboardNavigationItem[],
  locale: DashboardLocale,
  eligible: boolean,
): readonly DashboardNavigationItem[] {
  const items = new Map(
    navigation
      .filter((item) => item.id !== "security")
      .map((item) => [item.id, item] as const),
  );
  if (eligible) {
    const security = registrations.find(
      (registration) =>
        registration.id === "security" &&
        registration.availability === "IMPLEMENTED",
    );
    if (security) items.set("security", itemFromRegistration(security, locale));
  }
  return registrations.flatMap((registration) => {
    const item = items.get(registration.id);
    return item ? [item] : [];
  });
}

import { md02NavigationRegistrations } from "../../features/administration/administration-navigation";
import { md01NavigationRegistrations } from "./md01-navigation";
import { composeNavigationRegistry } from "./navigation-registry";

/**
 * Stable navigation extension point for feature-owned registration groups.
 *
 * Future MD feature streams own their registration arrays and add only that
 * group here. Auth, scope, shell, and route composition stay unchanged.
 */
export const dashboardNavigationRegistrations = composeNavigationRegistry(
  md01NavigationRegistrations,
  md02NavigationRegistrations,
);

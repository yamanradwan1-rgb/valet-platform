import { md02NavigationRegistrations } from "../../features/administration/administration-navigation";
import { auditNavigationRegistrations } from "../../features/audit/audit-navigation";
import { md03NavigationRegistrations } from "../../features/operations/operations-navigation";
import { visitContactNavigationRegistrations } from "../../features/visit-contacts/visit-contact-navigation";
import { intelligenceNavigationRegistrations } from "../../features/intelligence/intelligence-navigation";
import { md01NavigationRegistrations } from "./md01-navigation";
import { composeNavigationRegistry } from "./navigation-registry";
import { orderDashboardNavigationRegistrations } from "./product-navigation-order";

/**
 * Stable navigation extension point for feature-owned registration groups.
 *
 * Future MD feature streams own their registration arrays and add only that
 * group here. Auth, scope, shell, and route composition stay unchanged.
 */
export const dashboardNavigationRegistrations =
  orderDashboardNavigationRegistrations(
    composeNavigationRegistry(
      md01NavigationRegistrations,
      md02NavigationRegistrations,
      md03NavigationRegistrations,
      visitContactNavigationRegistrations,
      auditNavigationRegistrations,
      intelligenceNavigationRegistrations,
    ),
  );

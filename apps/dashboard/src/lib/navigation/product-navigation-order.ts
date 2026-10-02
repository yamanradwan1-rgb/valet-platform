import type { DashboardNavigationRegistration } from "./navigation-types";

const productOrder = [
  "overview",
  "live-operations",
  "vehicles",
  "tasks",
  "employees-shifts",
  "locations",
  "maps-zones",
  "keys",
  "payments",
  "validations", // Reserved slot; intentionally no R01 registration.
  "incidents",
  "visit-contacts",
  "analytics",
  "reports",
  "policies-settings",
  "roles-permissions",
  "branding",
  "billing-subscription",
  "management-audit",
  "security",
  "help",
] as const;

const productRank = new Map<string, number>(
  productOrder.map((id, index) => [id, index]),
);

export function orderDashboardNavigationRegistrations(
  registrations: readonly DashboardNavigationRegistration[],
): readonly DashboardNavigationRegistration[] {
  return registrations
    .map((registration, index) => ({ index, registration }))
    .sort((left, right) => {
      const leftRank = productRank.get(left.registration.id);
      const rightRank = productRank.get(right.registration.id);
      if (leftRank !== undefined && rightRank !== undefined) {
        return leftRank - rightRank;
      }
      if (leftRank !== undefined) return -1;
      if (rightRank !== undefined) return 1;
      return left.index - right.index;
    })
    .map(({ registration }) => registration);
}

import type { ContextHelpKey } from "./context-help-registry";
import type { HelpRouteClassification } from "./context-help-types";

type ContentRoute = {
  readonly classification: "CONTENT";
  readonly helpKey: ContextHelpKey;
};
type ExcludedRoute = {
  readonly classification: Exclude<HelpRouteClassification, "CONTENT">;
  readonly reason: string;
};
export type HelpRoute = ContentRoute | ExcludedRoute;

// Exact App Router page inventory, including root and explicit exclusions.
export const helpRouteManifest = {
  "/": { classification: "CONTENT", helpKey: "workspace.page" },
  "/overview": { classification: "CONTENT", helpKey: "overview.page" },
  "/live-operations": { classification: "CONTENT", helpKey: "live.page" },
  "/vehicles": { classification: "CONTENT", helpKey: "vehicles.page" },
  "/tasks": { classification: "CONTENT", helpKey: "tasks.page" },
  "/maps-zones": { classification: "CONTENT", helpKey: "maps.page" },
  "/keys": { classification: "CONTENT", helpKey: "keys.page" },
  "/incidents": { classification: "CONTENT", helpKey: "incidents.page" },
  "/employees": { classification: "CONTENT", helpKey: "staff.page" },
  "/locations": { classification: "CONTENT", helpKey: "locations.page" },
  "/policies": { classification: "CONTENT", helpKey: "policies.page" },
  "/guest-information": { classification: "CONTENT", helpKey: "guest-information.page" },
  "/roles-permissions": { classification: "CONTENT", helpKey: "roles.page" },
  "/branding": { classification: "CONTENT", helpKey: "branding.page" },
  "/billing-subscription": { classification: "CONTENT", helpKey: "billing.page" },
  "/payments": { classification: "CONTENT", helpKey: "payments.page" },
  "/analytics": { classification: "CONTENT", helpKey: "analytics.page" },
  "/reports": { classification: "CONTENT", helpKey: "reports.page" },
  "/audit-log": { classification: "CONTENT", helpKey: "audit.page" },
  "/customers": { classification: "CONTENT", helpKey: "contacts.page" },
  "/security": { classification: "CONTENT", helpKey: "security.page" },
  "/help": { classification: "CONTENT", helpKey: "help.page" },
  "/staff/activate": { classification: "CONTENT", helpKey: "activation.page" },
  "/integrations": {
    classification: "REDIRECT",
    reason: "Redirects to the authorized Policies service tab",
  },
  "/foundation-test-subscription-recovery": {
    classification: "TEST_ONLY",
    reason: "Internal fixture is unavailable in production",
  },
} as const satisfies Record<string, HelpRoute>;

export type HelpRoutePath = keyof typeof helpRouteManifest;
export type ContentHelpRoutePath = {
  [K in HelpRoutePath]: (typeof helpRouteManifest)[K] extends ContentRoute ? K : never;
}[HelpRoutePath];

export function isContentHelpRoute(path: HelpRoutePath): path is ContentHelpRoutePath {
  return helpRouteManifest[path].classification === "CONTENT";
}

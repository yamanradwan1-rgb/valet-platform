import type { ContextHelpKey } from "./context-help-registry";
import type { HelpRoutePath } from "./help-route-manifest";

// Independently maintained semantic mount inventory, tied to actual feature
// groups; the corresponding UI mounting is reserved for later #278 units.
export const helpSectionManifest = {
  overview: [
    "overview.period", "overview.metrics", "overview.current", "overview.activity",
  ],
  liveOperations: [
    "live.kpis", "live.sessions", "live.retrieval", "live.sessionDetail",
  ],
  vehicles: ["vehicles.search", "vehicles.table", "vehicles.drawer"],
  tasks: ["tasks.filters", "tasks.table", "tasks.drawer"],
  maps: ["maps.mode", "maps.live", "maps.setup", "maps.legend"],
  keys: ["keys.operational", "keys.configuration", "keys.resourceDetails"],
  incidents: ["incidents.list", "incidents.detail"],
  staff: ["staff.employees", "staff.shifts", "staff.details"],
  locations: [
    "locations.list", "locations.detail", "locations.lifecycle", "locations.create",
  ],
  policies: ["policies.company", "policies.location", "policies.services"],
  roles: ["roles.reference"],
  branding: ["branding.company", "branding.location"],
  billing: ["billing.status", "billing.entitlements"],
  payments: ["payments.period", "payments.summary", "payments.breakdown"],
  analytics: [
    "analytics.period", "analytics.cards", "analytics.activity", "analytics.durations",
  ],
  reports: ["reports.catalog", "reports.preview", "reports.export"],
  audit: ["audit.filters", "audit.table", "audit.detail"],
  contacts: [
    "contacts.search", "contacts.results", "contacts.detail", "contacts.correction",
  ],
  security: ["security.auth", "security.sessions"],
  help: ["help.guides", "help.security", "help.faq"],
  activation: ["activation.invitation"],
} as const satisfies Record<string, readonly ContextHelpKey[]>;

export const helpSectionRoutes = {
  overview: "/overview",
  liveOperations: "/live-operations",
  vehicles: "/vehicles",
  tasks: "/tasks",
  maps: "/maps-zones",
  keys: "/keys",
  incidents: "/incidents",
  staff: "/employees",
  locations: "/locations",
  policies: "/policies",
  roles: "/roles-permissions",
  branding: "/branding",
  billing: "/billing-subscription",
  payments: "/payments",
  analytics: "/analytics",
  reports: "/reports",
  audit: "/audit-log",
  contacts: "/customers",
  security: "/security",
  help: "/help",
  activation: "/staff/activate",
} as const satisfies Record<keyof typeof helpSectionManifest, HelpRoutePath>;

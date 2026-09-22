import { History } from "lucide-react";

import { defineNavigationDestination } from "../../lib/navigation/navigation-registry";

export const auditNavigationRegistrations = [
  defineNavigationDestination({
    accessRequirement: "MANAGEMENT_AUDIT",
    availability: "IMPLEMENTED",
    href: "/audit-log",
    icon: History,
    id: "management-audit",
    labels: { ar: "سجل التدقيق", en: "Audit Log" },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"],
    scopeRequirement: "ORGANIZATION",
  }),
] as const;

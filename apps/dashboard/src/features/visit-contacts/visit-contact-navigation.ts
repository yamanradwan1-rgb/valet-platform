import { ContactRound } from "lucide-react";

import { defineNavigationDestination } from "../../lib/navigation/navigation-registry";

export const visitContactNavigationRegistrations = [
  defineNavigationDestination({
    accessRequirement: "VISIT_CONTACTS",
    availability: "IMPLEMENTED",
    href: "/customers",
    icon: ContactRound,
    id: "visit-contacts",
    labels: { ar: "جهات اتصال الزيارات", en: "Visit Contacts" },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
] as const;

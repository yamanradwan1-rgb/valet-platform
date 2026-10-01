import {
  Activity,
  Car,
  ClipboardList,
  KeyRound,
  Map,
  TriangleAlert,
} from "lucide-react";

import { defineNavigationDestination } from "../../lib/navigation/navigation-registry";

const managementRoles = ["COMPANY_ADMIN", "LOCATION_MANAGER"] as const;

export const md03NavigationRegistrations = [
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED",
    href: "/live-operations", icon: Activity, id: "live-operations",
    labels: { ar: "العمليات المباشرة", en: "Live Operations" }, owner: "MD-03",
    placement: "MAIN", roles: managementRoles, scopeRequirement: "LOCATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED",
    href: "/vehicles", icon: Car, id: "vehicles",
    labels: { ar: "المركبات", en: "Vehicles" }, owner: "MD-03",
    placement: "MAIN", roles: managementRoles, scopeRequirement: "LOCATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED",
    href: "/tasks", icon: ClipboardList, id: "tasks",
    labels: { ar: "المهام", en: "Tasks" }, owner: "MD-03",
    placement: "MAIN", roles: managementRoles, scopeRequirement: "LOCATION",
  }),
  defineNavigationDestination({
    accessRequirement: "LOCATION_MAPS", availability: "IMPLEMENTED",
    href: "/maps-zones", icon: Map, id: "maps-zones",
    labels: { ar: "الخرائط والمناطق", en: "Maps & Zones" }, owner: "MD-03",
    placement: "MAIN", roles: ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"],
    scopeRequirement: "LOCATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED",
    href: "/keys", icon: KeyRound, id: "keys",
    labels: { ar: "المفاتيح ومواقف السيارات", en: "Keys & Spots" }, owner: "MD-03",
    placement: "MAIN", roles: managementRoles, scopeRequirement: "LOCATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED",
    href: "/incidents", icon: TriangleAlert, id: "incidents",
    labels: { ar: "الحوادث", en: "Incidents" }, owner: "MD-03",
    placement: "MAIN", roles: managementRoles, scopeRequirement: "LOCATION",
  }),
] as const;

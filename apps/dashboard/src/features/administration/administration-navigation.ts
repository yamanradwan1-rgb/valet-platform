import {
  Cpu,
  FileCheck,
  MapPin,
  Palette,
  Receipt,
  Shield,
  Users,
} from "lucide-react";

import { defineNavigationDestination } from "../../lib/navigation/navigation-registry";

export const md02NavigationRegistrations = [
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED", href: "/employees",
    icon: Users, id: "employees-shifts",
    labels: { ar: "الموظفون والورديات", en: "Employees & Shifts" }, owner: "MD-02",
    placement: "MAIN", roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED", href: "/locations",
    icon: MapPin, id: "locations", labels: { ar: "المواقع", en: "Locations" },
    owner: "MD-02", placement: "MAIN", roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED", href: "/policies",
    icon: FileCheck, id: "policies-settings",
    labels: { ar: "السياسات والإعدادات", en: "Policies & Settings" }, owner: "MD-02",
    placement: "MAIN", roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED", href: "/roles-permissions",
    icon: Shield, id: "roles-permissions",
    labels: { ar: "الأدوار والصلاحيات", en: "Roles & Permissions" }, owner: "MD-02",
    placement: "MAIN", roles: ["COMPANY_ADMIN"], scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "BRANDING", availability: "IMPLEMENTED", href: "/branding",
    icon: Palette, id: "branding", labels: { ar: "الهوية البصرية", en: "Branding" },
    owner: "MD-02", placement: "MAIN", roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "DASHBOARD", availability: "IMPLEMENTED", href: "/integrations",
    icon: Cpu, id: "integrations", labels: { ar: "التكاملات", en: "Integrations" },
    owner: "MD-02", placement: "MAIN", roles: ["COMPANY_ADMIN"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "SUBSCRIPTION_READ", availability: "IMPLEMENTED",
    href: "/billing-subscription", icon: Receipt, id: "billing-subscription",
    labels: { ar: "الاشتراك", en: "Billing & Subscription" }, owner: "MD-02",
    placement: "MAIN", roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
] as const;

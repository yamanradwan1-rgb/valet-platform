import { BarChart3, CreditCard, LayoutDashboard } from "lucide-react";

import { defineNavigationDestination } from "../../lib/navigation/navigation-registry";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import { ReportsFileTextIcon } from "./reports-reference-icons";

const roles = ["COMPANY_ADMIN", "LOCATION_MANAGER"] as const;

export const intelligenceNavigationRegistrations = [
  defineNavigationDestination({
    accessRequirement: "MANAGEMENT_INTELLIGENCE",
    availability: "IMPLEMENTED",
    href: "/overview",
    icon: LayoutDashboard,
    id: "overview",
    labels: { ar: "نظرة عامة", en: "Overview" },
    owner: "MD-05",
    placement: "MAIN",
    roles,
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "MANAGEMENT_INTELLIGENCE",
    availability: "IMPLEMENTED",
    href: "/payments",
    icon: CreditCard,
    id: "payments",
    labels: { ar: "المدفوعات", en: "Payments" },
    owner: "MD-05",
    placement: "MAIN",
    roles,
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "MANAGEMENT_INTELLIGENCE",
    availability: "IMPLEMENTED",
    href: "/analytics",
    icon: BarChart3,
    id: "analytics",
    labels: { ar: "التحليلات", en: "Analytics" },
    owner: "MD-05",
    placement: "MAIN",
    roles,
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    accessRequirement: "MANAGEMENT_INTELLIGENCE",
    availability: "IMPLEMENTED",
    href: "/reports",
    icon: ReportsFileTextIcon,
    id: "reports",
    labels: { ar: "التقارير", en: "Reports" },
    owner: "MD-05",
    placement: "MAIN",
    roles,
    scopeRequirement: "ORGANIZATION",
  }),
] as const satisfies readonly DashboardNavigationRegistration[];

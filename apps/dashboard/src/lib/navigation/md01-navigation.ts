import { CircleHelp, LayoutDashboard, ShieldCheck } from "lucide-react";

import { ar, en } from "../i18n/dictionaries";
import {
  composeNavigationRegistry,
  defineNavigationDestination,
} from "./navigation-registry";
import type { DashboardNavigationRegistration } from "./navigation-types";

const roles = ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"] as const;

export const md01NavigationRegistrations =
  composeNavigationRegistry([
    defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/",
      icon: LayoutDashboard,
      id: "workspace",
      labels: { ar: ar.workspace, en: en.workspace },
      owner: "MD-01",
      placement: "MAIN",
      roles,
      scopeRequirement: "NONE",
    }),
    defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/security",
      icon: ShieldCheck,
      id: "security",
      labels: { ar: ar.security, en: en.security },
      owner: "MD-01",
      placement: "UTILITY",
      roles,
      scopeRequirement: "NONE",
    }),
    defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/help",
      icon: CircleHelp,
      id: "help",
      labels: { ar: ar.help, en: en.help },
      owner: "MD-01",
      placement: "UTILITY",
      roles,
      scopeRequirement: "NONE",
    }),
  ] satisfies readonly DashboardNavigationRegistration[]);

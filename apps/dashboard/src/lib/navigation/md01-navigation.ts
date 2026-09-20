import type { TranslationKey } from "../i18n/dictionaries";
import {
  composeNavigationRegistry,
  defineNavigationDestination,
} from "./navigation-registry";
import type { DashboardNavigationRegistration } from "./navigation-types";

type Md01NavigationLabelKey = Extract<
  TranslationKey,
  "workspace" | "security" | "help"
>;

const roles = ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"] as const;

export const md01NavigationRegistrations =
  composeNavigationRegistry<Md01NavigationLabelKey>([
    defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/",
      id: "workspace",
      labelKey: "workspace",
      owner: "MD-01",
      roles,
      scopeRequirement: "NONE",
    }),
    defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/security",
      id: "security",
      labelKey: "security",
      owner: "MD-01",
      roles,
      scopeRequirement: "NONE",
    }),
    defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/help",
      id: "help",
      labelKey: "help",
      owner: "MD-01",
      roles,
      scopeRequirement: "NONE",
    }),
  ] satisfies readonly DashboardNavigationRegistration<Md01NavigationLabelKey>[]);

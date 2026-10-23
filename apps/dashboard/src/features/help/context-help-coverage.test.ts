import { readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { managementSettingKeySchema } from "@valet/contracts";
import { legacyLocationKeys, settingDefinitions } from "../administration/settings/setting-definitions";
import { presenceFields } from "../administration/settings/shift-presence-policy-fields";
import { contextHelpRegistry } from "./context-help-registry";
import { inspectHelpCatalog, inspectRouteInventory, inspectSettingInventory } from "./context-help-coverage-contract";
import { helpRouteManifest } from "./help-route-manifest";
import { helpSectionManifest, helpSectionRoutes } from "./help-section-manifest";
import { helpSectionSourceFiles, type SectionHelpKey } from "./help-section-source-manifest";
import { additionalHelpKeys, ordinarySettingHelpKeys, presencePolicyHelpKeys, specialSettingsHelpKeys } from "./help-setting-manifest";

const app = fileURLToPath(new URL("../../app/", import.meta.url));
const dashboard = fileURLToPath(new URL("../../../", import.meta.url));

function actualAppRoutes(folder: string = app): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((file) => {
    const filePath = join(folder, file.name);
    if (file.isDirectory()) return actualAppRoutes(filePath);
    if (file.name !== "page.tsx") return [];
    const parent = relative(app, folder).split(sep).join("/");
    return [parent ? "/" + parent : "/"];
  }).sort();
}

const sectionKeys = Object.values(helpSectionManifest).flat();
// The reviewed route-to-page contract is an independent oracle for URL swaps.
const expectedPageHelpByRoute = {
  "/": "workspace.page",
  "/overview": "overview.page",
  "/live-operations": "live.page",
  "/vehicles": "vehicles.page",
  "/tasks": "tasks.page",
  "/maps-zones": "maps.page",
  "/keys": "keys.page",
  "/incidents": "incidents.page",
  "/employees": "staff.page",
  "/locations": "locations.page",
  "/policies": "policies.page",
  "/guest-information": "guest-information.page",
  "/roles-permissions": "roles.page",
  "/branding": "branding.page",
  "/billing-subscription": "billing.page",
  "/payments": "payments.page",
  "/analytics": "analytics.page",
  "/reports": "reports.page",
  "/audit-log": "audit.page",
  "/customers": "contacts.page",
  "/security": "security.page",
  "/help": "help.page",
  "/staff/activate": "activation.page",
} as const;
const contentRoutes = Object.entries(helpRouteManifest)
  .filter(([, route]) => route.classification === "CONTENT");
const contentRouteHelpKeys = Object.values(helpRouteManifest)
  .flatMap((route) => route.classification === "CONTENT" ? [route.helpKey] : []);
const ordinaryKeys = Object.values(ordinarySettingHelpKeys);
const allDeclaredKeys = [
  ...contentRouteHelpKeys,
  ...sectionKeys,
  ...ordinaryKeys,
  ...specialSettingsHelpKeys,
];

describe("source-driven contextual-help coverage", () => {
  it("classifies every actual App Router page and excludes redirect/internal test routes", () => {
    const routes = actualAppRoutes();
    expect(inspectRouteInventory(routes, helpRouteManifest)).toEqual([]);
    expect(routes).toHaveLength(25);
    expect(contentRoutes).toHaveLength(23);
    expect(Object.fromEntries(contentRoutes.map(([route, entry]) => {
      if (entry.classification !== "CONTENT") throw new Error("Invalid CONTENT filter");
      return [route, entry.helpKey];
    }))).toEqual(expectedPageHelpByRoute);
    expect(helpRouteManifest["/"].helpKey).toBe("workspace.page");
    expect(helpRouteManifest["/integrations"].classification).toBe("REDIRECT");
    expect(helpRouteManifest["/foundation-test-subscription-recovery"].classification).toBe("TEST_ONLY");
    const excluded = Object.values(helpRouteManifest)
      .filter((route) => route.classification !== "CONTENT");
    expect(excluded).toHaveLength(2);
    expect(excluded.every((route) => !("helpKey" in route))).toBe(true);
  });

  it("catches newly added, deleted, unclassified, or wrongly exposed routes", () => {
    const knownRoutes = actualAppRoutes();
    expect(inspectRouteInventory([...knownRoutes, "/brand-new"], helpRouteManifest))
      .toContain("Unclassified route: /brand-new");
    expect(inspectRouteInventory(knownRoutes.filter((route) => route !== "/overview"), helpRouteManifest))
      .toContain("Obsolete route: /overview");
    const broken = {
      ...helpRouteManifest,
      "/integrations": { classification: "REDIRECT" as const, helpKey: "policies.services", reason: "bad" },
    };
    expect(inspectRouteInventory(knownRoutes, broken))
      .toContain("Excluded route exposes help: /integrations");
    const swapped = {
      ...expectedPageHelpByRoute,
      "/vehicles": "tasks.page",
      "/tasks": "vehicles.page",
    };
    expect(swapped).not.toEqual(expectedPageHelpByRoute);
    expect(Object.fromEntries(contentRoutes.map(([path, entry]) =>
      [path, entry.classification === "CONTENT" ? entry.helpKey : ""])))
      .not.toEqual(swapped);
  });

  it("maps every ordinary typed Settings row exactly once and respects the LM legacy subset", () => {
    const actual = settingDefinitions.map(({ key }) => key);
    expect(actual).toHaveLength(15);
    expect(new Set(actual).size).toBe(actual.length);
    const fromContract = managementSettingKeySchema.options.filter((key) => key !== "operatingHours");
    expect(actual.slice().sort()).toEqual(fromContract.sort());
    expect(inspectSettingInventory(actual, ordinarySettingHelpKeys, "setting.")).toEqual([]);
    expect(Object.keys(ordinarySettingHelpKeys).sort()).toEqual(actual.slice().sort());
    expect(ordinaryKeys.slice().sort()).toEqual(actual.map((key) => "setting." + key).sort());
    expect(legacyLocationKeys.size).toBe(10);
    expect([...legacyLocationKeys].every((key) => actual.includes(key))).toBe(true);
    expect(actual.filter((key) => legacyLocationKeys.has(key))).toHaveLength(10);
    expect(new Set(ordinaryKeys).size).toBe(15);
    expect(contextHelpRegistry["setting.operatingHours"]).toBeDefined();
    expect(contextHelpRegistry["setting.slaTargetSeconds"]).toBeDefined();
  });

  it("fails if a source Settings row or Presence field lacks its dedicated key", () => {
    const actual = settingDefinitions.map(({ key }) => key);
    expect(inspectSettingInventory([...actual, "newTypedField"], ordinarySettingHelpKeys, "setting."))
      .toContain("Missing setting help: newTypedField");
    expect(inspectSettingInventory(actual.slice(1), ordinarySettingHelpKeys, "setting."))
      .toContain("Obsolete setting help: checkInPhotosRequired");
    expect(inspectSettingInventory(actual, {
      ...ordinarySettingHelpKeys,
      trackingEnabled: "setting.checkInPhotosRequired",
    }, "setting.")).toEqual(expect.arrayContaining([
      "Incorrect setting help: trackingEnabled",
      "Duplicate setting help values",
    ]));
    const presence = presenceFields.map(({ field }) => field);
    expect(presence).toHaveLength(4);
    expect(new Set(presence).size).toBe(4);
    expect(Object.keys(presencePolicyHelpKeys).sort()).toEqual(presence.slice().sort());
    expect(Object.values(presencePolicyHelpKeys).slice().sort())
      .toEqual(presence.map((field) => "presence." + field).sort());
    expect(inspectSettingInventory(presence, presencePolicyHelpKeys, "presence.")).toEqual([]);
    expect(inspectSettingInventory([...presence, "someNewPresenceField"], presencePolicyHelpKeys, "presence."))
      .toContain("Missing setting help: someNewPresenceField");
  });

  it("accounts for all section surfaces with checked source anchors and valid content routes", () => {
    expect(sectionKeys).toHaveLength(61);
    expect(new Set(sectionKeys).size).toBe(61);
    expect(Object.keys(helpSectionSourceFiles).sort()).toEqual(sectionKeys.slice().sort());
    for (const [feature, keys] of Object.entries(helpSectionManifest)) {
      const route = helpSectionRoutes[feature as keyof typeof helpSectionRoutes];
      expect(helpRouteManifest[route].classification, feature).toBe("CONTENT");
      for (const key of keys) {
        const source = helpSectionSourceFiles[key as SectionHelpKey];
        expect(existsSync(join(dashboard, source)), key + ": " + source).toBe(true);
      }
    }
  });

  it("covers all non-ordinary editors, read-only service facts and every declared semantic entry", () => {
    expect(specialSettingsHelpKeys).toHaveLength(13);
    expect(additionalHelpKeys).toHaveLength(9);
    for (const key of ["setting.operatingHours", "setting.slaTargetSeconds",
      "policies.presence", "presence.readiness", "presence.zones",
      "presence.zoneForm", "presence.exceptions", "presence.review",
      "services.status"]) expect(additionalHelpKeys).toContain(key);
    // The accepted #316 guest-information route has its own bilingual help key.
    expect(new Set(allDeclaredKeys).size).toBe(112);
    expect(inspectHelpCatalog(Object.entries(contextHelpRegistry), allDeclaredKeys)).toEqual([]);
    expect(Object.keys(contextHelpRegistry).slice().sort()).toEqual(allDeclaredKeys.slice().sort());
  });
});

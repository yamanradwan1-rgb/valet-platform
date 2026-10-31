import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { config, repo, root, vite } from "../scripts/runtime.mjs";

import { verifySettingValues } from "./settings-value-parity.mjs";

const server = await vite.createServer({
  ...config,
  appType: "custom",
  server: { ...config.server, middlewareMode: true },
});
const checks = [];
const same = (actual, expected, label) => {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
  checks.push(label);
};
const load = (file) =>
  server.ssrLoadModule(path.join(repo, file).replaceAll("\\", "/"));
try {
  const catalog = await server.ssrLoadModule("/src/catalog.ts");
  const { parseField } = await server.ssrLoadModule(
    "/src/setting-validation.ts",
  );
  const model = await server.ssrLoadModule("/src/presence-readiness.ts");
  const fixtures = await server.ssrLoadModule("/src/fixtures.ts");
  const management = await load(
    "packages/contracts/src/management-settings.ts",
  );
  const legacy = await load("packages/contracts/src/location-configuration.ts");
  const presence = await load(
    "packages/contracts/src/shift-presence-management.ts",
  );
  const policy = await load("packages/contracts/src/shift-presence-policy.ts");
  const zoneSchema = presence.shiftPresenceZoneCreateRequestSchema;
  const waNames = [
    "enabled",
    "language",
    "templateCatalogVersion",
    "providerBindingId",
  ];
  const waMapping = ["waEnabled", "waLanguage", "waTemplate", "waBinding"];
  const zoneMapping = {
    code: "code",
    label: "label",
    latitude: "latitude",
    longitude: "longitude",
    radiusMeters: "radius",
    state: "status",
  };

  const ordinary = catalog.fields.filter(
    (field) =>
      !field.key.startsWith("shift") &&
      !field.key.startsWith("wa") &&
      field.key !== "slaTargetSeconds",
  );
  same(
    ordinary.map((field) => field.key).concat("operatingHours"),
    management.managementSettingKeySchema.options,
    "All Company ordinary keys match backend catalog",
  );
  same(
    catalog.fields
      .filter((field) => field.section === "presence")
      .map((field) => field.key),
    presence.shiftPresenceFieldSchema.options,
    "All four Presence keys match backend",
  );
  same(
    catalog.fields
      .filter((field) => field.section === "whatsapp")
      .map((field) => field.key),
    waMapping,
    "All four WhatsApp policy controls are represented",
  );
  same(
    Object.keys(zoneSchema.shape).filter(
      (key) => !["mutationId", "zoneId"].includes(key),
    ),
    Object.keys(zoneMapping),
    "All six zone configuration attributes match backend",
  );
  const waSource = readFileSync(
    path.join(
      repo,
      "apps/api/src/modules/notifications/whatsapp-settings-validation.ts",
    ),
    "utf8",
  );
  for (const name of waNames)
    assert.ok(waSource.includes(`readonly ${name}:`), name);
  checks.push(
    "WhatsApp field mapping traced to current backend input validator",
  );

  function represented(role, scope) {
    const sections = catalog.availableSections(role, scope);
    return sections
      .flatMap((section) =>
        catalog.visibleFields(section, role, scope).map((field) => field.key),
      )
      .concat(sections.includes("hours") ? ["operatingHours"] : [])
      .concat(
        sections.includes("zones")
          ? Object.values(zoneMapping).map((key) => `zone.${key}`)
          : [],
      );
  }
  const presenceKeys = presence.shiftPresenceFieldSchema.options;
  const zoneKeys = Object.values(zoneMapping).map((key) => `zone.${key}`);
  const expectedCompany = Object.keys(
    management.managementCompanySettingsResponseSchema.shape.defaults.shape,
  ).concat(presenceKeys, waMapping);
  const expectedLocation = Object.keys(
    management.managementLocationSettingsResponseSchema.shape.settings.shape,
  ).concat(presenceKeys, waMapping, zoneKeys);
  const expectedManager = legacy.configurationSettingKeySchema.options.concat(
    presenceKeys,
    zoneKeys,
  );
  same(
    represented("COMPANY_ADMIN", "company"),
    expectedCompany,
    "Company Admin / Company coverage",
  );
  same(
    represented("COMPANY_ADMIN", "location"),
    expectedLocation,
    "Company Admin / Location coverage",
  );
  same(
    represented("LOCATION_MANAGER", "location"),
    expectedManager,
    "Location Manager exact catalog; no role inheritance",
  );
  same(
    represented("DENIED", "company"),
    [],
    "Denied role has no settings sections",
  );
  assert.ok(
    !catalog
      .availableSections("COMPANY_ADMIN", "location")
      .includes("services"),
  );
  checks.push(
    "Service Status intentionally excluded per latest Owner instruction",
  );

  checks.push(
    ...verifySettingValues(
      catalog,
      management,
      presence,
      policy,
      parseField,
      ordinary,
    ),
  );

  const store = { settings: {}, schedules: {}, zones: {} };
  assert.equal(
    model.allowsLocalPresenceChange(
      store,
      "demo-hospitality",
      "garden",
      "shiftStartPresenceMode",
      "REQUIRE",
      false,
    ),
    true,
  );
  assert.equal(
    model.allowsLocalPresenceChange(
      store,
      "demo-hospitality",
      "marina",
      "shiftStartPresenceMode",
      "REQUIRE",
      false,
    ),
    false,
  );
  assert.equal(
    model.allowsLocalPresenceChange(
      store,
      "demo-hospitality",
      null,
      "shiftStartPresenceMode",
      "REQUIRE",
      false,
    ),
    false,
  );
  const strict = {
    ...store,
    settings: {
      [fixtures.locationKey("demo-hospitality", "garden")]: {
        shiftStartPresenceMode: "REQUIRE",
      },
    },
  };
  assert.equal(
    model.localPresenceReadiness(strict, "demo-hospitality", "garden", [])
      .allowed,
    false,
  );
  checks.push(
    "Strict presence requires usable zones, including Company fanout and last-zone removal",
  );

  const result = {
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
    }).trim(),
    status: "PASS",
    checks,
    coverage: {
      companyAdminCompany: expectedCompany.length,
      companyAdminLocation: expectedLocation.length,
      locationManagerLocation: expectedManager.length,
    },
    catalogs: {
      company: expectedCompany,
      location: expectedLocation,
      locationManager: expectedManager,
    },
    exclusions: [
      "Service Status: Owner removal",
      "Privacy & Contact: separate destination",
      "Presence exception review: operational workflow, not configuration",
      "Live backend writes/MFA/CAS/audit and provider activation: Phase B",
    ],
    evidenceLevel:
      "Source-contract and local prototype parity only; no live backend mutation or device proof",
  };
  writeFileSync(
    path.join(root, "evidence/settings-parity.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      status: result.status,
      checks: checks.length,
      coverage: result.coverage,
      sourceSha: result.sourceSha,
    }),
  );
} finally {
  await server.close();
}

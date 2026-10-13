import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contextHelpRegistry } from "./context-help-registry";
import { helpRouteManifest } from "./help-route-manifest";
import { helpSectionSourceFiles } from "./help-section-source-manifest";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const owners = {
  "audit.page": "features/audit/audit-page.tsx",
  "contacts.page": "features/visit-contacts/visit-contacts-page.tsx",
  "security.page": "components/security/account-security-workspace.tsx",
  "help.page": "components/foundation/help-foundation.tsx",
  "activation.page": "features/administration/staff/staff-activation-page.tsx",
  "workspace.page": "components/foundation/root-product-landing.tsx",
} as const;

const sections = [
  "audit.filters", "audit.table", "audit.detail",
  "contacts.search", "contacts.results", "contacts.detail", "contacts.correction",
  "security.auth", "security.sessions",
  "help.guides", "help.security", "help.faq", "activation.invitation",
] as const;

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, `file:///${sourceRoot.replaceAll("\\", "/")}/`)), "utf8");
}

describe("Phase E exact authorized contextual help owners", () => {
  it("mounts every remaining page key in the real rendering owner", () => {
    expect(Object.keys(owners)).toHaveLength(6);
    for (const [key, owner] of Object.entries(owners)) {
      expect(source(owner), owner).toContain(`helpKey="${key}"`);
      expect(contextHelpRegistry[key as keyof typeof contextHelpRegistry]).toBeDefined();
    }
    expect(helpRouteManifest["/"].classification).toBe("CONTENT");
  });

  it("mounts 13/13 sections in their manifest-declared owner", () => {
    expect(sections).toHaveLength(13);
    expect(new Set(sections).size).toBe(13);
    for (const key of sections) {
      const path = helpSectionSourceFiles[key].replace(/^src\//u, "");
      expect(source(path), `${key}: ${path}`).toContain(`helpKey="${key}"`);
      expect(contextHelpRegistry[key].ar.body.length).toBeGreaterThan(60);
      expect(contextHelpRegistry[key].en.body.length).toBeGreaterThan(60);
    }
  });

  it("keeps standalone activation token out of Help keys and identity", () => {
    const activation = source("features/administration/staff/staff-activation-page.tsx");
    expect(activation).toMatch(/scopeIdentity="activation-form"/u);
    expect(activation).not.toMatch(/scopeIdentity=\{(?:token|password)/u);
    expect(source("features/help/account-context-help.tsx")).not.toContain("selectedScope");
  });
});

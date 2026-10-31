import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mounts = {
  "staff.page": "../administration/staff/staff-page.tsx",
  "staff.employees": "../administration/staff/staff-employees-body.tsx",
  "staff.shifts": "../administration/staff/staff-shifts-body.tsx",
  "staff.details": "../administration/staff/staff-detail-drawer.tsx",
  "locations.page": "../administration/locations/locations-page.tsx",
  "locations.list": "../administration/locations/location-master.tsx",
  "locations.detail": "../administration/locations/location-detail.tsx",
  "locations.lifecycle":
    "../administration/locations/location-lifecycle-panel.tsx",
  "locations.create": "../administration/locations/location-create-dialog.tsx",
  "policies.page": "../administration/policies-studio/ui/Workspace.tsx",
  "policies.company": "../administration/policies-studio/ui/Workspace.tsx",
  "policies.location": "../administration/policies-studio/ui/Workspace.tsx",
  "roles.page": "../administration/roles/roles-page.tsx",
  "roles.reference": "../administration/roles/roles-page.tsx",
  "branding.page": "../administration/branding/branding-page.tsx",
  "branding.company": "../administration/branding/branding-editors.tsx",
  "branding.location": "../administration/branding/branding-editors.tsx",
  "billing.page": "../administration/commercial/subscription-page.tsx",
  "billing.status": "../administration/commercial/subscription-page.tsx",
  "billing.entitlements": "../administration/commercial/subscription-page.tsx",
} as const;

describe("Administration contextual-help mounts", () => {
  it("keeps route and section help keys in their active owners", () => {
    expect(Object.keys(mounts)).toHaveLength(20);

    for (const [key, source] of Object.entries(mounts)) {
      const contents = readFileSync(
        fileURLToPath(new URL(source, import.meta.url)),
        "utf8",
      );
      if (key.startsWith("policies.")) {
        expect(contents, source).toContain("ContextHelp");
        if (key === "policies.page")
          expect(contents, source).toContain(`helpKey="${key}"`);
        else
          expect(contents, `${key}: ${source}`).toContain(`"${key}"`);
      } else {
        expect(contents, source).toContain("ScopedContextHelp");
        expect(contents, `${key}: ${source}`).toContain(`helpKey="${key}"`);
      }
    }
  });
  it("also mounts staff detail help in the authorized Shift drawer", () => {
    const shift = readFileSync(
      fileURLToPath(new URL("../administration/staff/staff-shift-drawer.tsx", import.meta.url)),
      "utf8",
    );
    expect(shift).toContain('<ScopedContextHelp helpKey="staff.details" />');
  });
});

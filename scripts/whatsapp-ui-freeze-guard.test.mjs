import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedChange, forbiddenChanges, protectedPath, verifyUiFreeze,
} from "./whatsapp-ui-freeze-guard.mjs";

const pinnedPaths = new Set([
  "apps/dashboard/src/features/administration/settings/settings-page.tsx",
  "apps/dashboard/src/features/administration/settings/company-settings-panel.tsx",
]);

test("original client code, assets and visual snapshots stay frozen", () => {
  const paths = [
    "apps/customer/src/app/page.tsx", "apps/valet-native/src/check-in/foo.tsx",
    "apps/valet/src/features/check-in/foo.tsx",
    "apps/dashboard/src/features/administration/settings/company-settings-panel.tsx",
    "packages/employee-client/src/employee-check-in-session.ts",
    "docs/validation/baseline-screenshot.png",
  ];
  assert.ok(paths.every(protectedPath));
  assert.deepEqual(forbiddenChanges(paths, pinnedPaths), paths);
});

test("allowlist is narrow and rejects generic dashboard/settings files", () => {
  const paths = [
    "apps/dashboard/src/features/administration/settings/settings-page.tsx",
    "apps/dashboard/src/features/administration/settings/whatsapp-company-panel.tsx",
    "apps/dashboard/src/features/administration/settings/whatsapp-settings.module.css",
    "apps/dashboard/src/features/administration/settings/whatsapp-settings-api.test.tsx",
    "packages/employee-client/src/whatsapp-compat-intake.test.ts",
    "apps/valet-native/test/whatsapp-compat-condition.test.ts",
    "docs/validation/whatsapp/W7-REVIEW.md",
    "docs/validation/whatsapp/W1_DATABASE_MIGRATION_PROOF.md",
    "docs/validation/whatsapp/W4_WORKER_DELIVERY_EVIDENCE.md",
    "docs/validation/whatsapp/PRIME_DELIVERY_EVIDENCE.md",
    "docs/validation/whatsapp/PRIME_FINAL_QA_REMEDIATION.md",
  ];
  assert.ok(paths.every((p) => approvedChange(p, pinnedPaths)));
  assert.equal(approvedChange("apps/dashboard/src/features/administration/settings/theme.tsx", pinnedPaths), false);
  assert.equal(approvedChange("apps/dashboard/src/features/administration/settings/company-settings-panel.tsx", pinnedPaths), false);
});

test("checks unchanged protected manifest against Git baseline", () => {
  assert.deepEqual(verifyUiFreeze().forbidden, []);
});

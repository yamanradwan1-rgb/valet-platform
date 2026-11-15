import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("operator source never invokes broad legacy provisioning and legacy guard still precedes grants", () => {
  const entrypoint = source("./provision-option-c-protected-cutover.mjs");
  const transaction = source("./option-c-protected-cutover-transaction.mjs");
  const state = source("./option-c-protected-cutover-state.mjs");
  const legacy = source("./provision-runtime-role.mjs");
  assert.doesNotMatch(
    entrypoint,
    /provision-runtime-role|provisionMfaPrivileges|provisionStaff/,
  );
  assert.doesNotMatch(
    transaction,
    /provision-runtime-role|provisionMfaPrivileges|provisionStaff/,
  );
  assert.match(state, /OPTION_C_PROTECTED_CUTOVER/);
  assert(
    legacy.indexOf("await assertOptionCProvisioningIsLegacy(client)") <
      legacy.indexOf("const existingRole = await client.query("),
  );
  assert.match(
    source("./option-c-runtime-provision-guard.mjs"),
    /WHERE singleton FOR SHARE/,
  );
});

test("cutover preflight includes the narrow Staff activation success definer", () => {
  const readiness = source("./option-c-protected-cutover-readiness.mjs");
  const acl = source("./option-c-protected-cutover-acl.mjs");
  assert.match(
    acl,
    /public\.s04_staff_activation_success\(uuid,text,text,text\)/,
  );
  assert.match(
    readiness,
    /assertFunctionReady\(\s*client,\s*optionCFunctionContract\.staffAuth\[2\]/,
  );
});

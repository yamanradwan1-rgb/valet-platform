import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

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
    /public\.s04_staff_activation_success\(uuid,text,text,text,xid8,uuid,bigint,text\)/,
  );
  assert.match(
    readiness,
    /assertOptionCFunctionReady\(\s*client,\s*optionCFunctionContract\.staffAuth\[2\]/,
  );
  const ownerReadiness = source("./option-c-protected-function-readiness.mjs");
  assert.match(ownerReadiness, /row\.owner !== expectedOwner/);
  assert.match(readiness, /assertRetiredTargetsExist\(client, migrationRole\)/);
  assert.match(ownerReadiness, /expectedOwnerAttributes/);
  assert.match(readiness, /requireTrustedOwnerAttributes: true/);
});

test("cutover readiness executes full StaffAuth and Management privilege verifiers", () => {
  const readiness = source("./option-c-protected-cutover-readiness.mjs");
  assert.match(
    readiness,
    /await verifyStaffAuthWriterGrants\(\s*client,\s*optionCRoles\.staffAuthWriter,\s*runtimeRole,\s*migrationRole/,
  );
  assert.match(
    readiness,
    /await verifyManagementWriterPrivileges\(\s*client,\s*optionCRoles\.managementWriter,\s*runtimeRole,\s*migrationRole/,
  );
  assert.match(
    readiness,
    /await verifyManagementWriterFunctionInventory\(\s*client,\s*optionCRoles\.managementWriter,\s*migrationRole/,
  );
  assert.match(
    readiness,
    /await verifyMfaProtectedWriterPrivileges\(\s*client,\s*runtimeRole,\s*migrationRole,\s*optionCRoles\.mfaWriter/,
  );
  assert.match(
    readiness,
    /await verifyStaffSessionLockAcl\(client, runtimeRole, migrationRole, \[/,
  );
  assert.match(readiness, /optionCRoles\.managementWriter,\s*\]\)/);
});

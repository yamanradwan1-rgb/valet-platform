import { test } from "node:test";
import { strict as assert } from "node:assert";
import { issue310LastMileGates } from "./issue310-last-mile-gates.mjs";

const safe = {
  database: "vaylet_wa310", migrationTotal: 102, migrationFinished: 102,
  migrationIncomplete: 0, principalsAreDistinct: true,
  senderHasNarrowExecute: true, senderHasBroadIntentSelect: false,
  organizationCount: 1, locationCount: 1, exactOrganization: true, exactLocation: true,
  controls: [
    { environment: "production", issueEnabled: false, sendEnabled: false },
    { environment: "test", issueEnabled: false, sendEnabled: false },
  ],
  localActivationOff: true, bindingCount: 1, verifiedBindingCount: 1,
  companyPolicyReady: true, locationPolicyReady: true,
  dispatchBudgetConfigured: true, currentConsentCount: 1,
  templateRegistryComplete: true, cleanHttpsOrigin: true,
};

test("external Meta, recipient and handset evidence never comes from SQL facts", () => {
  const result = issue310LastMileGates(safe);
  assert.equal(result.classification, "CONFIG_BLOCKED");
  assert.equal(result.gates.genuineMetaOwnershipEvidence, "UNVERIFIED_EXTERNALLY");
  assert.equal(result.gates.recipientMetaEnrollmentAndOptIn, "UNVERIFIED_EXTERNALLY");
});

test("release fences fail when any durable switch is enabled", () => {
  const result = issue310LastMileGates({
    ...safe, controls: [{environment:"test",issueEnabled:true,sendEnabled:false}],
  });
  assert.equal(result.gates.bothDurableEnvironmentsOff, "BLOCKED");
  assert.equal(result.classification, "CONFIG_BLOCKED");
});

test("unverified binding, missing grant or portful origin cannot be waved through", () => {
  const result = issue310LastMileGates({
    ...safe, verifiedBindingCount: 0, currentConsentCount: 0, cleanHttpsOrigin: false,
  });
  assert.equal(result.gates.providerBinding, "BLOCKED");
  assert.equal(result.gates.currentConsentGrant, "BLOCKED");
  assert.equal(result.gates.portlessCustomerHttps, "BLOCKED");
});

test("missing verified-binding dispatch budget blocks pre-send readiness", () => {
  const result = issue310LastMileGates({ ...safe, dispatchBudgetConfigured: false });
  assert.equal(result.gates.dispatchBudgetConfigured, "BLOCKED");
  assert.equal(result.classification, "CONFIG_BLOCKED");
});

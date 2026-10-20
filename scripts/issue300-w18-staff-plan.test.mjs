import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixturePlan } from "./issue300-r2-v2-org-fixture.mjs";
import {
  fourStaffPlan, validateOrgReceipt,
  validateProductProvisionResults, assertIndependentGrantRows,
} from "./issue300-w18-staff-plan.mjs";

const candidate = "a".repeat(40);
const lease = "issue300-r2-w18-real-fixture-20261020";
const fixture = fixturePlan(candidate, lease);
const plan = fourStaffPlan(candidate, lease);
const receipt = {
  kind: "ISSUE300_V2_ORG_LOCATION_PREREQUISITES_V1",
  candidateSha: candidate, leaseId: lease,
  database: "issue300_r2_w7_acceptance_v2",
  containerId: "b".repeat(64), readbackSha256: "c".repeat(64),
  ledgerSha256: "d".repeat(64),
  ...fixture,
  organizationCount: 2, locationCount: 3, subscriptionCount: 2,
};
const results = Object.fromEntries(Object.entries(plan).map(([name, p]) =>
  [name, { role: p.role, organizationId: p.organizationId,
    locationIds: p.locationIds, userId: randomUUID(),
    membershipId: randomUUID(), auditEventId: randomUUID() }]));
const rows = Object.entries(plan).flatMap(([name, p]) => p.locationIds.map(locationId => ({
  email: p.email, user_id: results[name].userId, membership_id: results[name].membershipId,
  organization_id: p.organizationId,
  location_id: locationId, role: p.role,
  user_status: "ACTIVE", membership_status: "ACTIVE",
  organization_status: "ACTIVE", location_status: "ACTIVE",
})));

test("W10 lease-bound Org A/B/foreign receipt and unique four product roles", () => {
  assert.deepEqual(validateOrgReceipt(receipt, candidate, lease), fixture);
  assert.equal(Object.keys(plan).length, 4);
  assert.equal(new Set(Object.values(plan).map(p => p.email)).size, 4);
  assert.deepEqual(plan.ca.locationIds, fixture.locationIds);
  assert.deepEqual(plan.lm.locationIds, [fixture.locationIds[1]]);
  assert.deepEqual(plan.supervisor.locationIds, [fixture.locationIds[1]]);
  assert.deepEqual(plan.foreign.locationIds, [fixture.foreignLocationId]);
  assert.equal(plan.foreign.organizationId, fixture.foreignOrganizationId);
  assert(Object.values(plan).every(p => p.argv.at(-1) === "--password-stdin"));
  assert.deepEqual(Object.values(plan).map(p => p.needsActualMfa),
    [true, true, false, true]);
});

test("foreign receipt, wrong Location B and fake counts are rejected", () => {
  for (const corrupt of [
    { ...receipt, candidateSha: "b".repeat(40) },
    { ...receipt, locationIds: [...fixture.locationIds].reverse() },
    { ...receipt, foreignOrganizationId: fixture.mainOrganizationId },
    { ...receipt, subscriptionCount: 1 },
  ]) assert.throws(() => validateOrgReceipt(corrupt, candidate, lease));
});

test("four unique canonical Staff output receipts and five exact DB grants", () => {
  assert.equal(validateProductProvisionResults(plan, results), true);
  assert.equal(validateProductProvisionResults(plan, {
    ...results, ca: {
      ...results.ca, locationIds: [...results.ca.locationIds].reverse(),
    },
  }), true);
  assert.equal(assertIndependentGrantRows(plan, rows, results), true);
  assert.throws(() => validateProductProvisionResults(plan, {
    ...results, supervisor: results.ca,
  }));
  assert.throws(() => validateProductProvisionResults(plan, {
    ...results, lm: { ...results.lm, locationIds: fixture.locationIds },
  }));
  assert.throws(() => validateProductProvisionResults(plan, {
    ...results, foreign: { ...results.foreign, organizationId: fixture.mainOrganizationId },
  }));
  assert.throws(() => assertIndependentGrantRows(plan,
    rows.map(row => row.email === plan.lm.email ? {
      ...row, location_id: fixture.locationIds[0],
    } : row), results));
  assert.throws(() => assertIndependentGrantRows(plan,
    rows.map(row => row.email === plan.foreign.email ? {
      ...row, organization_id: fixture.mainOrganizationId,
    } : row), results));
  assert.throws(() => assertIndependentGrantRows(plan,
    rows.map(row => row.email === plan.supervisor.email ? {
      ...row, membership_id: results.ca.membershipId,
    } : row), results));
});

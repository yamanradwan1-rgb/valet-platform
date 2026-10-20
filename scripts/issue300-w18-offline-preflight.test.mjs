import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { fixturePlan } from "./issue300-r2-v2-org-fixture.mjs";
import { fourStaffPlan } from "./issue300-w18-staff-plan.mjs";
import { inspectOfflineFiles } from "./issue300-w18-offline-preflight.mjs";

const candidate = "a".repeat(40);
const lease = "issue300-r2-w18-owned-offline-20261020";
const fixture = fixturePlan(candidate, lease);
const staff = fourStaffPlan(candidate, lease);
const env = {
  ISSUE300_R2_CANDIDATE_SHA: candidate,
  ISSUE300_W13_EXCLUSIVE_LEASE: lease,
  ISSUE300_W18_W10_RECEIPT: "receipt",
  ISSUE300_W18_PROVISION_RESULTS: "results",
  ISSUE300_W18_GRANT_READBACK: "rows",
  ISSUE300_W18_BROWSER_SCENARIO: "browser",
};
const provision = Object.fromEntries(Object.entries(staff).map(([name, p]) =>
  [name, { role: p.role, organizationId: p.organizationId,
    locationIds: p.locationIds, membershipId: randomUUID(),
    userId: randomUUID(), auditEventId: randomUUID() }]));
const rows = Object.entries(staff).flatMap(([name, p]) => p.locationIds.map(id =>
  ({ email: p.email, user_id: provision[name].userId,
    membership_id: provision[name].membershipId,
    organization_id: p.organizationId,
    location_id: id, role: p.role,
    organization_status: "ACTIVE", location_status: "ACTIVE",
    user_status: "ACTIVE", membership_status: "ACTIVE" })));
const values = {
  receipt: {
    kind: "ISSUE300_V2_ORG_LOCATION_PREREQUISITES_V1",
    candidateSha: candidate, leaseId: lease, ...fixture,
    database: "issue300_r2_w7_acceptance_v2",
    containerId: "b".repeat(64), readbackSha256: "c".repeat(64),
    ledgerSha256: "d".repeat(64),
    organizationCount: 2, locationCount: 3, subscriptionCount: 2,
  },
  results: provision,
  rows,
  browser: {
    candidateSha: candidate, leaseId: lease,
    organizationId: fixture.mainOrganizationId,
    locationId: fixture.locationIds[1],
    auditPath: "/audit-log?investigationDemo=1",
    date: "2026-10-20", start: "00:00", end: "23:59",
    expectsPaging: true,
    expectedSessionUuid: randomUUID(),
    expectedSourceId: "AUDIT:" + randomUUID(),
  },
};
const read = (key) => {
  if (!(key in values)) throw Error("UNEXPECTED_FILE");
  return values[key];
};

test("strictly nonexecuting plan and product receipt/oracle verification", () => {
  const prepared = inspectOfflineFiles({ env, command: "--plan", read });
  assert.equal(prepared.executable, false);
  assert.deepEqual(prepared.launcher,
    ["pnpm", "--filter", "@valet/api", "staff:provision", "--"]);
  assert.equal(inspectOfflineFiles({
    env, command: "--check-provision-results", read,
  }).submittedRowsMatchCanonicalReceipts, true);
  const browser = inspectOfflineFiles({ env, command: "--browser-plan", read });
  assert.equal(browser.cases.length, 34);
  assert(browser.cases.every(c => c.freshOwnerAttestationRequired));
});
test("missing W10 receipt, lease, real CA/LM/foreign grants cannot pass", () => {
  assert.throws(() => inspectOfflineFiles({
    env: { ...env, ISSUE300_W13_EXCLUSIVE_LEASE: "foreign" },
    command: "--plan", read,
  }));
  assert.throws(() => inspectOfflineFiles({
    env, command: "--check-provision-results",
    read: key => key === "rows" ? rows.slice(1) : read(key),
  }));
  assert.throws(() => inspectOfflineFiles({
    env, command: "--browser-plan",
    read: key => key === "browser" ? { ...values.browser,
      locationId: fixture.locationIds[0] } : read(key),
  }));
});

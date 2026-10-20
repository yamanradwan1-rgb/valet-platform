import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixturePlan } from "./issue300-r2-v2-org-fixture.mjs";

const gitSha = /^[a-f0-9]{40}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hexSha = /^[a-f0-9]{64}$/;
const ordered = ["ca", "lm", "supervisor", "foreign"];

// A source-only specification. The official product CLI still performs every
// actual Staff creation with a unique password through its private stdin.
export function fourStaffPlan(candidateSha, leaseId) {
  assert.match(candidateSha ?? "", gitSha);
  assert.match(leaseId ?? "", /^issue300-r2-[a-z0-9-]{8,}$/);
  const fixture = fixturePlan(candidateSha, leaseId);
  const suffix = createHash("sha256").update(candidateSha + ":" + leaseId)
    .digest("hex").slice(0, 20);
  const specs = {
    ca: ["ORG_ADMIN", fixture.mainOrganizationId, fixture.locationIds],
    lm: ["LOCATION_MANAGER", fixture.mainOrganizationId, [fixture.locationIds[1]]],
    supervisor: ["VALET_SUPERVISOR", fixture.mainOrganizationId, [fixture.locationIds[1]]],
    foreign: ["ORG_ADMIN", fixture.foreignOrganizationId, [fixture.foreignLocationId]],
  };
  return Object.fromEntries(ordered.map((name) => {
    const [role, organizationId, locationIds] = specs[name];
    const auditLocationId = name === "ca" ? fixture.locationIds[1] : locationIds[0];
    const email = `issue300-w18-${name}-${suffix}@example.test`;
    const argv = [
      "--organization-id", organizationId,
      "--audit-location-id", auditLocationId,
      ...locationIds.flatMap((id) => ["--location-id", id]),
      "--role", role, "--email", email,
      "--operator-ref", "issue300-r2-w18",
      "--reason", "Isolated Owner-leased Issue300 R2 acceptance",
      "--password-stdin",
    ];
    return [name, { role, organizationId, auditLocationId,
      locationIds: [...locationIds], email, argv,
      needsActualMfa: name !== "supervisor" }];
  }));
}

// A receipt from W10 is useful provenance only AFTER the independent Owner
// lease, PG identity and live row verification are established separately.
export function validateOrgReceipt(receipt, candidateSha, leaseId) {
  const expected = fixturePlan(candidateSha, leaseId);
  assert.equal(receipt?.kind, "ISSUE300_V2_ORG_LOCATION_PREREQUISITES_V1");
  assert.equal(receipt.candidateSha, candidateSha);
  assert.equal(receipt.leaseId, leaseId);
  assert.equal(receipt.database, "issue300_r2_w7_acceptance_v2");
  assert.match(receipt.containerId ?? "", hexSha);
  assert.match(receipt.readbackSha256 ?? "", hexSha);
  assert.match(receipt.ledgerSha256 ?? "", hexSha);
  for (const [key, value] of Object.entries(expected))
    assert.deepEqual(receipt[key], value, `W18_WRONG_${key}`);
  assert.equal(receipt.organizationCount, 2);
  assert.equal(receipt.locationCount, 3);
  assert.equal(receipt.subscriptionCount, 2);
  return expected;
}

export function validateProductProvisionResults(plan, results) {
  assert.deepEqual(Object.keys(results ?? {}).sort(), [...ordered].sort(),
    "W18_ALL_FOUR_REAL_PRODUCT_RECEIPTS_REQUIRED");
  const users = new Set();
  const memberships = new Set();
  const audits = new Set();
  for (const name of ordered) {
    const item = results[name];
    const expected = plan[name];
    assert.deepEqual([...(item?.locationIds ?? [])].sort(),
      [...expected.locationIds].sort(),
      `W18_${name}_EXACT_LOCATION_GRANTS_REQUIRED`);
    assert.equal(item.organizationId, expected.organizationId);
    assert.equal(item.role, expected.role);
    for (const [field, set] of [["userId", users],
      ["membershipId", memberships], ["auditEventId", audits]]) {
      assert.match(item[field] ?? "", uuid, `W18_${name}_REAL_${field}_REQUIRED`);
      assert(!set.has(item[field]), `W18_SHARED_${field}_DENIED`);
      set.add(item[field]);
    }
  }
  return true;
}

export function assertIndependentGrantRows(plan, rows, results) {
  validateProductProvisionResults(plan, results);
  assert(Array.isArray(rows) && rows.length === 5,
    "W18_EXACT_FIVE_PERSISTED_GRANTS_REQUIRED");
  const expected = ordered.flatMap((name) => plan[name].locationIds.map((locationId) =>
    [plan[name].email, results[name].userId, results[name].membershipId,
      plan[name].organizationId, plan[name].role, locationId].join("|")));
  const actual = rows.map((row) => {
    assert.equal(row.user_status, "ACTIVE");
    assert.equal(row.membership_status, "ACTIVE");
    assert.equal(row.location_status, "ACTIVE");
    assert.equal(row.organization_status, "ACTIVE");
    return [row.email, row.user_id, row.membership_id,
      row.organization_id, row.role, row.location_id].join("|");
  });
  assert.deepEqual(actual.sort(), expected.sort(), "W18_WRONG_PERSISTED_ROLE_OR_GRANT");
  return true;
}

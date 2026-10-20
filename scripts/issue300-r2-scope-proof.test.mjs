import assert from "node:assert/strict";
import { test } from "node:test";
import { requireOwnedScopeEvidence } from "./issue300-r2-scope-proof.mjs";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const auditId = "33333333-3333-4333-8333-333333333333";
const scope = (ids = [auditId], overrides = {}) => ({
  organizationId, locationId, approvedAuditEventIds: ids, ...overrides,
});

function fakeAdmin(rows = [{
  id: auditId, organization_id: organizationId, location_id: locationId,
}], locationExists = true) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("FROM public.locations")) {
        return { rowCount: Number(locationExists), rows: locationExists ? [{ id: locationId }] : [] };
      }
      if (sql.includes("FROM public.audit_events")) {
        return { rowCount: rows.length, rows };
      }
      throw Error("Unapproved scope SQL");
    },
  };
}

test("issuer verifies existing exact Organization/Location and each source ID", async () => {
  const admin = fakeAdmin();
  await requireOwnedScopeEvidence(admin, [scope()]);
  assert.equal(admin.calls.length, 2);
  assert.deepEqual(admin.calls[0].values, [organizationId, locationId]);
  assert.deepEqual(admin.calls[1].values, [[auditId]]);
  assert.match(admin.calls[1].sql, /WHERE a\.id = ANY\(\$1::uuid\[\]\)/);
});

test("issuer rejects missing owned Location", async () => {
  await assert.rejects(
    requireOwnedScopeEvidence(fakeAdmin([], false), [scope([])]),
    /not an owned Organization/,
  );
});

test("issuer rejects a source ID missing from the database", async () => {
  await assert.rejects(
    requireOwnedScopeEvidence(fakeAdmin([]), [scope()]),
    /missing from owned database/,
  );
});

test("issuer rejects cross-Organization and cross-Location Audit identities", async () => {
  for (const field of ["organization_id", "location_id"]) {
    const row = {
      id: auditId, organization_id: organizationId, location_id: locationId,
      [field]: "44444444-4444-4444-8444-444444444444",
    };
    await assert.rejects(requireOwnedScopeEvidence(fakeAdmin([row]), [scope()]), /another/);
  }
});

test("issuer refuses one Audit ID shared between scopes", async () => {
  const admin = fakeAdmin();
  await assert.rejects(
    requireOwnedScopeEvidence(admin, [
      scope(), scope([auditId], { locationId: "55555555-5555-4555-8555-555555555555" }),
    ]),
    /multiple scopes/,
  );
});

test("issuer rejects duplicate Organization/Location proof", async () => {
  await assert.rejects(
    requireOwnedScopeEvidence(fakeAdmin(), [scope(), scope()]),
    /Duplicate source proof scope/,
  );
});

test("issuer leaves malformed or contradictory association fixture intact", async () => {
  // Provenance is the persisted Audit row's tenant/location, NOT
  // guessed Task/Incident/Session links from its metadata.
  const admin = fakeAdmin();
  await requireOwnedScopeEvidence(admin, [scope()]);
  assert(!admin.calls.some(({ sql }) => /JOIN public\.(tasks|incidents|valet_sessions)/.test(sql)));
});

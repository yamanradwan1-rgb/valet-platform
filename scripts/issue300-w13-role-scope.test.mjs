import assert from "node:assert/strict";
import { test } from "node:test";
import { fixturePlan } from "./issue300-r2-v2-org-fixture.mjs";
import { assertW13RoleScope } from "./issue300-w13-role-scope.mjs";

const candidate = "a".repeat(40);
const lease = "issue300-r2-w13-scope-lease-001";
const plan = fixturePlan(candidate, lease);
const main = { organizationId: plan.mainOrganizationId,
  locationId: plan.locationIds[1] };
const foreign = { kind: "FOREIGN_ORG",
  organizationId: plan.foreignOrganizationId,
  locationId: plan.foreignLocationId };
const proof = { allowedScopes: [
  { organizationId: plan.mainOrganizationId,
    locationId: plan.locationIds[0] },
  main,
] };
const fixture = { lanes: Array.from({ length: 6 }, () => ({
  org: main.organizationId, location: main.locationId,
  negativeScopes: [foreign],
})) };

test("LM scope derives exact Location B, not first attested Location A", () => {
  const scopes = assertW13RoleScope({ candidate, lease, proof, fixture });
  assert.deepEqual(scopes.main, main);
  assert.deepEqual(scopes.foreign, {
    organizationId: foreign.organizationId,
    locationId: foreign.locationId,
  });
});

test("LM never receives a Location A held scenario", () => {
  const lanes = [...fixture.lanes];
  lanes[0] = { ...lanes[0], location: plan.locationIds[0] };
  assert.throws(() => assertW13RoleScope({ candidate, lease, proof,
    fixture: { lanes } }), /LOCATION_B_ONLY/);
});

test("reordered scopes, foreign tenant swaps, missing B all fail closed", () => {
  assert.deepEqual(assertW13RoleScope({ candidate, lease,
    proof: { allowedScopes: [...proof.allowedScopes].reverse() }, fixture }).main,
  main);
  assert.throws(() => assertW13RoleScope({ candidate, lease,
    proof: { allowedScopes: [proof.allowedScopes[0]] }, fixture }),
  /LOCATION_B_SCOPE_REQUIRED/);
  const lanes = fixture.lanes.map(lane => ({ ...lane,
    negativeScopes: [{ ...foreign, locationId: plan.locationIds[0] }],
  }));
  assert.throws(() => assertW13RoleScope({ candidate, lease, proof,
    fixture: { lanes } }), /EXACT_FOREIGN/);
});

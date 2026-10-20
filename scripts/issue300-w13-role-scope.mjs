// Explicit W10-derived Location B for LM; never trust allowedScopes ordering.
import assert from "node:assert/strict";
import { fixturePlan } from "./issue300-r2-v2-org-fixture.mjs";

export function assertW13RoleScope({ candidate, lease, proof, fixture }) {
  const bound = fixturePlan(candidate, lease);
  const main = {
    organizationId: bound.mainOrganizationId,
    locationId: bound.locationIds[1],
  };
  const foreign = {
    organizationId: bound.foreignOrganizationId,
    locationId: bound.foreignLocationId,
  };
  const other = {
    organizationId: bound.mainOrganizationId,
    locationId: bound.locationIds[0],
  };
  // allowedScopes is a runtime AUTHORIZATION allowlist. Do not include the
  // foreign negative tenant here merely to prove its existence; the separate
  // independently signed fixture and live DB readback establish negatives.
  assert(Array.isArray(proof.allowedScopes) &&
    proof.allowedScopes.length > 0 &&
    proof.allowedScopes.every(scope =>
      scope.organizationId === main.organizationId &&
      [main.locationId, other.locationId].includes(scope.locationId)),
  "W13_PROOF_ALLOWLIST_MUST_NOT_AUTHORIZE_FOREIGN_TENANT");
  assert(proof.allowedScopes?.some(scope =>
    scope.organizationId === main.organizationId &&
    scope.locationId === main.locationId),
  "W13_SIGNED_LOCATION_B_SCOPE_REQUIRED");
  // Every held cohort is tested by BOTH CA and LM; the current W13 runner
  // deliberately supports Location B lanes only, never unauthorized A lanes.
  assert(Array.isArray(fixture.lanes) && fixture.lanes.length >= 6 &&
    fixture.lanes.every(lane => lane.org === main.organizationId &&
      lane.location === main.locationId),
  "W13_LM_LOCATION_B_ONLY_LANES_REQUIRED");
  for (const lane of fixture.lanes) {
    assert(Array.isArray(lane.negativeScopes) &&
      lane.negativeScopes.length === 2 &&
      lane.negativeScopes.some(scope =>
      scope.kind === "FOREIGN_ORG" &&
      scope.organizationId === foreign.organizationId &&
      scope.locationId === foreign.locationId),
    "W13_EXACT_FOREIGN_NEGATIVE_SCOPE_REQUIRED");
    assert(lane.negativeScopes.some(scope =>
      scope.kind === "OTHER_LOCATION" &&
      scope.organizationId === other.organizationId &&
      scope.locationId === other.locationId),
    "W13_EXACT_LOCATION_A_NEGATIVE_SCOPE_REQUIRED");
  }
  return { main, foreign, other };
}

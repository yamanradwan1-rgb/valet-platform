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
    assert(lane.negativeScopes?.some(scope =>
      scope.kind === "FOREIGN_ORG" &&
      scope.organizationId === foreign.organizationId &&
      scope.locationId === foreign.locationId),
    "W13_EXACT_FOREIGN_NEGATIVE_SCOPE_REQUIRED");
  }
  return { main, foreign };
}

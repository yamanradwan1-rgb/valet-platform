import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { assertCurrentStaffAuthority } from "./issue300-w13-staff-authority.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1);
const location = id(2);

test("actual Staff identity check rejects invented CA/LM roles and stale MFA", () => {
  const token = "vsa1.unit-test-credential";
  const valid = {
    org,
    location,
    role: "LOCATION_MANAGER",
    membership_id: id(100),
    membership_status: "ACTIVE",
    user_status: "ACTIVE",
    org_status: "ACTIVE",
    location_status: "ACTIVE",
    factor_state: "ACTIVE",
    revoked_at: null,
    access_hash: `staff-access-sha256:v1:${createHash("sha256").update(token).digest("hex")}`,
    has_location_grant: true,
    database_now: "2026-10-18T10:00:00Z",
    access_expires_at: "2026-10-18T11:00:00Z",
    absolute_expires_at: "2026-10-18T12:00:00Z",
    mfa_authenticated_at: "2026-10-18T09:45:00Z",
    last_admin_activity_at: "2026-10-18T09:55:00Z",
  };
  const expectedRole = {
    role: "LOCATION_MANAGER",
    organizationId: org,
    locationId: location,
  };
  assert.doesNotThrow(() =>
    assertCurrentStaffAuthority(valid, expectedRole, token),
  );
  for (const bad of [
    { role: "VALET_SUPERVISOR" },
    { has_location_grant: false },
    { membership_status: "INACTIVE" },
    { factor_state: null },
    { access_hash: "different" },
    { mfa_authenticated_at: "2026-10-17T00:00:00Z" },
    { last_admin_activity_at: "2026-10-18T09:00:00Z" },
  ])
    assert.throws(() =>
      assertCurrentStaffAuthority({ ...valid, ...bad }, expectedRole, token),
    );
});

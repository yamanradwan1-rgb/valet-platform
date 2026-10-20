import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const hexUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function assertCurrentStaffAuthority(row, expected, token) {
  assert(row, "No independently persisted current Staff identity");
  assert.equal(row.org, expected.organizationId, "Wrong authenticated tenant");
  assert.equal(
    row.location,
    expected.locationId,
    "Wrong authenticated Location",
  );
  assert.equal(row.role, expected.role, "Incorrect actual membership role");
  assert.match(row.membership_id ?? "", hexUuid);
  assert.equal(row.user_status, "ACTIVE");
  assert.equal(row.membership_status, "ACTIVE");
  assert.equal(row.org_status, "ACTIVE");
  assert.equal(row.location_status, "ACTIVE");
  assert.equal(row.revoked_at, null);
  assert.equal(
    row.access_hash,
    `staff-access-sha256:v1:${createHash("sha256").update(token).digest("hex")}`,
    "Stored token hash not bound to exact issued Staff session",
  );
  if (
    expected.role === "LOCATION_MANAGER" ||
    expected.role === "VALET_SUPERVISOR"
  )
    assert.equal(
      row.has_location_grant,
      true,
      "Location manager/supervisor is missing exact Location grant",
    );
  const now = new Date(row.database_now).getTime();
  const expires = new Date(row.access_expires_at).getTime();
  const absolute = new Date(row.absolute_expires_at).getTime();
  assert(
    Number.isFinite(now) && now < expires && now < absolute,
    "Staff session token is expired",
  );
  if (expected.requireMfa !== false) {
    assert.equal(row.factor_state, "ACTIVE");
    const mfa = new Date(row.mfa_authenticated_at).getTime();
    const activity = new Date(row.last_admin_activity_at).getTime();
    assert(
      Number.isFinite(mfa) && mfa <= now && now - mfa < 8 * 60 * 60_000,
      "Real Staff MFA assurance is missing/expired",
    );
    assert(
      Number.isFinite(activity) &&
        activity <= now &&
        now - activity < 30 * 60_000,
      "Real Staff MFA admin-activity assurance is missing/expired",
    );
  }
}

/** Matches the accepted session + membership/grant + MFA policy's persisted
 * exact-current predicates without ever selecting protected MFA secret bytes. */
export async function verifyStaffAuthority(
  admin,
  viewer,
  account,
  expected,
  request,
) {
  assert.match(viewer.sessionId ?? "", hexUuid);
  if (expected.requireMfa !== false) {
    const response = await request("/v1/staff/auth/mfa/state", viewer.token);
    assert.equal(
      response.status,
      200,
      "Normal staff MFA state endpoint failed",
    );
    assert.equal(response.cache, "no-store");
    assert.deepEqual(
      response.json,
      { state: "ASSURED" },
      "The current real Staff session has no normal MFA assurance",
    );
  }
  const result = await admin.query(
    `SELECT session.current_access_token_hash AS access_hash,
       session.access_expires_at, session.absolute_expires_at,
       session.revoked_at, session.mfa_authenticated_at,
       session.last_admin_activity_at, factor.state::text AS factor_state,
       membership.id AS membership_id, membership.role::text AS role,
       membership.status::text AS membership_status, staff_user.status::text AS user_status,
       organization.id::text AS org, organization.status::text AS org_status,
       location.id::text AS location, location.status::text AS location_status,
       clock_timestamp() AS database_now,
       EXISTS (SELECT 1 FROM membership_location_access AS granted
         WHERE granted.organization_id=membership.organization_id
           AND granted.membership_id=membership.id
           AND granted.location_id=location.id) AS has_location_grant
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id=session.user_id
     INNER JOIN organization_memberships AS membership
       ON membership.user_id=staff_user.id
     INNER JOIN organizations AS organization
       ON organization.id=membership.organization_id
     INNER JOIN locations AS location
       ON location.organization_id=organization.id AND location.id=$3::uuid
     LEFT JOIN user_mfa_totp_factors AS factor
       ON factor.user_id=session.user_id AND factor.id=session.mfa_factor_id
     WHERE session.id=$1::uuid AND lower(staff_user.email)=lower($2)
       AND membership.organization_id=$4::uuid AND membership.role=$5::membership_role`,
    [
      viewer.sessionId,
      account.email,
      expected.locationId,
      expected.organizationId,
      expected.role,
    ],
  );
  assert.equal(
    result.rowCount,
    1,
    "No unique authentic session/current role/tenant/Location membership",
  );
  assertCurrentStaffAuthority(result.rows[0], expected, viewer.token);
  return result.rows[0].membership_id;
}

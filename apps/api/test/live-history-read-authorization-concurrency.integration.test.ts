import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import {
  LiveHistoryAuthorizationRaceFixture,
  type Revoker,
} from "./live-history-read-authorization-concurrency-test-fixture";
import { isolatedLiveHistoryLabConfigured } from "./live-history-owned-lab";

const labEnabled = isolatedLiveHistoryLabConfigured();
// Test-case tables refer to fixture methods during Vitest collection, before
// beforeAll hooks run. Construct only in the explicitly verified Windows lab.
let fixture!: LiveHistoryAuthorizationRaceFixture;
if (labEnabled) fixture = new LiveHistoryAuthorizationRaceFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture?.stop(), 60_000);

const revokeLocationLifecycle: Revoker = async (client, current) => {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('location-lifecycle:' || $1::text, 0)
     )`,
    [current.locationId],
  );
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [current.organizationId],
  );
  await client.query(
    "UPDATE locations SET status='INACTIVE', accepting_intake=FALSE WHERE id=$1",
    [current.locationId],
  );
};

const rotateStaffSessionToken: Revoker = async (client, current) => {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-user-security:' || $1::text, 0)
     )`,
    [current.userId],
  );
  await client.query(
    `SELECT session.id
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id=session.user_id
     INNER JOIN staff_refresh_credentials AS refresh
       ON refresh.session_id=session.id AND refresh.consumed_at IS NULL
     WHERE session.id=$1
     FOR UPDATE OF refresh, session, staff_user`,
    [current.sessionId],
  );
  const tokenHash = `staff-access-sha256:v1:${current.sessionId
    .replaceAll("-", "")
    .repeat(2)}`;
  await client.query(
    `UPDATE staff_auth_sessions
     SET current_access_token_hash=$2,last_rotated_at=clock_timestamp(),
         access_expires_at=LEAST(clock_timestamp()+interval '15 minutes',absolute_expires_at)
     WHERE id=$1`,
    [current.sessionId, tokenHash],
  );
};

const revokeMembershipRole: Revoker = async (client, current) => {
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-management-org:' || $1::text, 0)
     )`,
    [current.organizationId],
  );
  await client.query(
    `SELECT id FROM organization_memberships
     WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [current.membershipId, current.organizationId],
  );
  await client.query(
    `UPDATE organization_memberships
     SET role='VALET_SUPERVISOR',version=version+1,updated_at=clock_timestamp()
     WHERE id=$1`,
    [current.membershipId],
  );
};

const revokeOrganizationLifecycle: Revoker = async (client, current) => {
  await client.query(
    `UPDATE organizations
     SET status='INACTIVE',updated_at=clock_timestamp()
     WHERE id=$1`,
    [current.organizationId],
  );
};

const lockedAuthorityRevocations: ReadonlyArray<{
  readonly name: string;
  readonly revoke: Revoker;
}> = [
  { name: "LM grant", revoke: (client, current) => fixture.revokeGrant(client, current) },
  { name: "dashboard entitlement", revoke: (client, current) => fixture.revokeEntitlement(client, current) },
  { name: "Location lifecycle", revoke: revokeLocationLifecycle },
  { name: "Staff refresh token generation", revoke: rotateStaffSessionToken },
  { name: "membership role", revoke: revokeMembershipRole },
  { name: "Organization lifecycle", revoke: revokeOrganizationLifecycle },
];

describe.runIf(labEnabled)(
  "Issue #276 Live history current-authority PostgreSQL races", () => {
  it("holds exact Staff session authority through the read, then denies after committed revocation", async () => {
    const current = await fixture.locationManagerScenario();
    await fixture.readFirstThenRevoke(current, fixture.revokeSession);
    await expect(fixture.freshAuthorization(current)).resolves.toBeNull();
  }, 30_000);

  it("waits behind a Staff session revoker and rechecks the committed revoked session", async () => {
    const current = await fixture.locationManagerScenario();
    await expect(
      fixture.revokerFirstThenRead(current, fixture.revokeSession),
    ).resolves.toBeNull();
  }, 30_000);

  it.each(lockedAuthorityRevocations)(
    "holds $name authority through the read, then denies after committed revocation",
    async ({ revoke }) => {
      const current = await fixture.locationManagerScenario();
      await fixture.readFirstThenRevoke(current, revoke);
      await expect(fixture.freshAuthorization(current)).resolves.toBeNull();
    },
    30_000,
  );

  it.each(lockedAuthorityRevocations)(
    "waits behind a $name revoker and rechecks the committed authority loss",
    async ({ revoke }) => {
      const current = await fixture.locationManagerScenario();
      await expect(
        fixture.revokerFirstThenRead(current, revoke),
      ).resolves.toBeNull();
    },
    30_000,
  );

  it("holds CA MFA proof through the read and rejects after session-first factor retirement", async () => {
    const current = await fixture.companyAdminScenario();
    await fixture.readFirstThenRevoke(current, fixture.retireMfa);
    await expect(fixture.freshAuthorization(current)).rejects.toBeInstanceOf(
      MfaStepUpRequiredError,
    );
  }, 30_000);

  it("waits behind session-first CA MFA retirement and rejects the retired factor", async () => {
    const current = await fixture.companyAdminScenario();
    await expect(
      fixture.revokerFirstThenRead(current, fixture.retireMfa),
    ).rejects.toBeInstanceOf(MfaStepUpRequiredError);
  }, 30_000);
});

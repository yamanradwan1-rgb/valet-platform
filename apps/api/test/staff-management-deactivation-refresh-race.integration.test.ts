import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function staffPath(organizationId: string, membershipId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}`;
}

function contextPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/context?scopeKind=ALL_LOCATIONS`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

async function twoOrganizationTarget(organizationA: string) {
  const user = await fixture.createUser();
  const membershipA = await fixture.addMembership(
    organizationA,
    user.id,
    "ORG_ADMIN",
  );
  const organizationB = await fixture.createOrganization();
  const membershipB = await fixture.addMembership(
    organizationB,
    user.id,
    "ORG_ADMIN",
  );
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  return { auth, factor, membershipA, membershipB, organizationB, user };
}

async function holdAuditBarrier(): Promise<PoolClient> {
  const client = await fixture.databasePool().connect();
  await client.query("BEGIN");
  await client.query("LOCK TABLE audit_events IN ACCESS EXCLUSIVE MODE");
  return client;
}

async function waitForBlockedAuditInsert(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname=current_database()
           AND state='active'
           AND wait_event_type='Lock'
           AND query LIKE '%INSERT INTO audit_events%'
       ) AS blocked`,
    );
    if (result.rows[0]?.blocked === true) return;
  }
  throw new Error(
    "Timed out waiting for blocked Staff deactivation audit insert.",
  );
}

async function releaseBarrier(client: PoolClient): Promise<void> {
  try {
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

async function expectTenantIsolation(input: {
  accessToken: string;
  factorId: string;
  membershipA: string;
  membershipB: string;
  organizationA: string;
  organizationB: string;
  sessionId: string;
  userId: string;
}) {
  const state = await fixture.query<{
    a_status: string;
    a_version: number;
    b_status: string;
    b_version: number;
    user_status: string;
  }>(
    `SELECT staff_user.status::text AS user_status,
            membership_a.status::text AS a_status,membership_a.version AS a_version,
            membership_b.status::text AS b_status,membership_b.version AS b_version
     FROM users AS staff_user
     INNER JOIN organization_memberships AS membership_a ON membership_a.id=$2
     INNER JOIN organization_memberships AS membership_b ON membership_b.id=$3
     WHERE staff_user.id=$1`,
    [input.userId, input.membershipA, input.membershipB],
  );
  expect(state.rows[0]).toEqual({
    a_status: "INACTIVE",
    a_version: 2,
    b_status: "ACTIVE",
    b_version: 1,
    user_status: "ACTIVE",
  });

  const session = (await fixture.sessionSnapshot(input.sessionId)).rows[0]!;
  expect(session.revoked_at).toBeNull();
  expect(session.mfa_factor_id).toBe(input.factorId);
  const factors = await fixture.factors(input.userId);
  expect(factors.rows).toHaveLength(1);
  expect(factors.rows[0]).toMatchObject({
    id: input.factorId,
    state: "ACTIVE",
  });

  const organizationA = await fixture.managementGet(
    contextPath(input.organizationA),
    input.accessToken,
  );
  expect(organizationA.status).toBe(404);
  expect(organizationA.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  const organizationB = await fixture.managementGet(
    contextPath(input.organizationB),
    input.accessToken,
  );
  expect(organizationB.status).toBe(200);
  expect(organizationB.body).toMatchObject({
    organization: { organizationId: input.organizationB },
  });
}

describe("MGT-BE-04 membership deactivation vs native refresh", () => {
  it("allows an overlapping refresh while deactivation commits only Organization A", async () => {
    const actor = await assuredAdmin();
    const target = await twoOrganizationTarget(actor.membership.organizationId);
    const barrier = await holdAuditBarrier();
    let barrierOpen = true;
    try {
      const deactivation = fixture.managementPost(
        `${staffPath(actor.membership.organizationId, target.membershipA)}/deactivate`,
        actor.auth.accessToken,
        { expectedVersion: 1 },
      );
      await waitForBlockedAuditInsert();

      const refreshed = await fixture.refresh(target.auth.refreshToken);
      expect(refreshed.status).toBe(200);

      await releaseBarrier(barrier);
      barrierOpen = false;
      const deactivated = await deactivation;
      expect(deactivated.status).toBe(201);
      expect(deactivated.body).toMatchObject({
        status: "INACTIVE",
        version: 2,
      });

      await expectTenantIsolation({
        accessToken: String(refreshed.body?.accessToken),
        factorId: target.factor.factorId,
        membershipA: target.membershipA,
        membershipB: target.membershipB,
        organizationA: actor.membership.organizationId,
        organizationB: target.organizationB,
        sessionId: target.auth.sessionId,
        userId: target.user.id,
      });
    } catch (error) {
      if (barrierOpen) {
        await barrier.query("ROLLBACK").catch(() => undefined);
        barrier.release();
      }
      throw error;
    }
  }, 30_000);

  it("keeps native refresh usable after Organization A deactivation commits first", async () => {
    const actor = await assuredAdmin();
    const target = await twoOrganizationTarget(actor.membership.organizationId);
    const deactivated = await fixture.managementPost(
      `${staffPath(actor.membership.organizationId, target.membershipA)}/deactivate`,
      actor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(deactivated.status).toBe(201);

    const refreshed = await fixture.refresh(target.auth.refreshToken);
    expect(refreshed.status).toBe(200);
    await expectTenantIsolation({
      accessToken: String(refreshed.body?.accessToken),
      factorId: target.factor.factorId,
      membershipA: target.membershipA,
      membershipB: target.membershipB,
      organizationA: actor.membership.organizationId,
      organizationB: target.organizationB,
      sessionId: target.auth.sessionId,
      userId: target.user.id,
    });
  }, 30_000);
});

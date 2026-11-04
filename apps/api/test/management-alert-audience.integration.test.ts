import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  authorizeManagementAlertPhaseOneAudience,
  type PhaseOneManagementAlertCategory,
} from "../src/modules/dashboard/management-alert-audience-authorization";
import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";

const fixture = new ManagementAlertMfaFixture();

beforeAll(() => fixture.start(), 180_000);
afterAll(() => fixture.stop(), 60_000);

async function authorize(input: {
  accessToken: string;
  category: PhaseOneManagementAlertCategory;
  locationId: string;
  sessionId: string;
  userId: string;
}) {
  const context = await fixture.contextFor(
    input.accessToken,
    input.sessionId,
    input.userId,
  );
  const client = await fixture.databasePool().connect();
  try {
    await client.query("BEGIN");
    const authority = await authorizeManagementAlertPhaseOneAudience(
      client as unknown as PostgresTransaction,
      { category: input.category, context, locationId: input.locationId },
    );
    await client.query("COMMIT");
    return authority;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const approvedCategories = [
  "ALT-01",
  "ALT-02",
  "ALT-03",
  "ALT-08",
  "ALT-12",
] as const;

describe("Issue #414 phase-one Management alert audience (PG17, bypass OFF)", () => {
  it("requires CA session-bound MFA, current entitlement, and a selected active Organization Location", async () => {
    const { auth, location, membership, user } =
      await fixture.createAssuredAdmin();
    const input = {
      accessToken: auth.accessToken,
      category: "ALT-01" as const,
      locationId: location.locationId,
      sessionId: auth.sessionId,
      userId: user.id,
    };
    const original = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    for (const category of approvedCategories) {
      const scope = await authorize({ ...input, category });
      expect(scope).toMatchObject({
        organizationId: membership.organizationId,
        membershipId: membership.membershipId,
        locationId: location.locationId,
      });
    }
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]
        ?.last_admin_activity_at,
    ).toEqual(original.last_admin_activity_at);
    expect(
      await authorize({ ...input, category: "ALT-10" as never }),
    ).toBeNull();
    expect(await authorize({ ...input, locationId: randomUUID() })).toBeNull();
    const foreign = await fixture.createOrganization();
    const foreignLocation = await fixture.addLocation(foreign);
    expect(
      await authorize({ ...input, locationId: foreignLocation.locationId }),
    ).toBeNull();

    await fixture.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
      [membership.organizationId],
    );
    expect(await authorize(input)).toBeNull();
    await fixture.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE WHERE organization_id=$1",
      [membership.organizationId],
    );
    await fixture.query(
      "UPDATE locations SET status='INACTIVE', accepting_intake=FALSE WHERE id=$1",
      [location.locationId],
    );
    expect(await authorize(input)).toBeNull();
  });

  it("allows only exact-granted LM Location, denies stale/revoked grants and other roles", async () => {
    const company = await fixture.createAssuredAdmin();
    const org = company.membership.organizationId;
    const permitted = company.location.locationId;
    const other = await fixture.addLocation(org);
    const manager = await fixture.createManager(org);
    await fixture.grantLocation(org, manager.membershipId, permitted);
    const input = {
      accessToken: manager.auth.accessToken,
      category: "ALT-12" as const,
      locationId: permitted,
      sessionId: manager.auth.sessionId,
      userId: manager.user.id,
    };
    expect(await authorize(input)).toMatchObject({
      locationId: permitted,
      membershipId: manager.membershipId,
      organizationId: org,
    });
    expect(
      await authorize({ ...input, locationId: other.locationId }),
    ).toBeNull();

    await fixture.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [manager.membershipId, permitted],
    );
    expect(await authorize(input)).toBeNull();
    await fixture.grantLocation(org, manager.membershipId, permitted);
    expect(await authorize(input)).not.toBeNull();
    await fixture.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [manager.membershipId],
    );
    expect(await authorize(input)).toBeNull();

    const supervisor = await fixture.createUser();
    const memberId = await fixture.addMembership(
      org,
      supervisor.id,
      "VALET_SUPERVISOR",
    );
    await fixture.grantLocation(org, memberId, permitted);
    const supervisorAuth = await fixture.nativeLogin(supervisor);
    expect(
      await authorize({
        ...input,
        accessToken: supervisorAuth.accessToken,
        sessionId: supervisorAuth.sessionId,
        userId: supervisor.id,
      }),
    ).toBeNull();
  });

  it("rejects stale bearer on refresh and revoked sessions, without extending assurance", async () => {
    const { auth, location, user } = await fixture.createAssuredAdmin();
    const input = {
      accessToken: auth.accessToken,
      category: "ALT-08" as const,
      locationId: location.locationId,
      sessionId: auth.sessionId,
      userId: user.id,
    };
    const before = (await fixture.sessionSnapshot(auth.sessionId)).rows[0]!;
    const rotated = await fixture.refresh(auth.refreshToken);
    expect(rotated.status).toBe(200);
    expect(await authorize(input)).toBeNull();
    const current = {
      ...input,
      accessToken: String(rotated.body?.accessToken),
    };
    expect(await authorize(current)).not.toBeNull();
    expect(
      (await fixture.sessionSnapshot(auth.sessionId)).rows[0]
        ?.last_admin_activity_at,
    ).toEqual(before.last_admin_activity_at);

    await fixture.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [auth.sessionId],
    );
    expect(await authorize(current)).toBeNull();
  });

  it("fails closed for CA idle assurance even on an otherwise eligible source", async () => {
    const { auth, location, user } = await fixture.createAssuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '1 hour',
           mfa_authenticated_at=clock_timestamp()-interval '40 minutes',
           last_admin_activity_at=clock_timestamp()-interval '31 minutes'
       WHERE id=$1`,
      [auth.sessionId],
    );
    await expect(
      authorize({
        accessToken: auth.accessToken,
        category: "ALT-02",
        locationId: location.locationId,
        sessionId: auth.sessionId,
        userId: user.id,
      }),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});

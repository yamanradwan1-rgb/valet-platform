import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
async function admin() {
  const user = await fixture.createUser();
  const member = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { member, auth };
}

describe("#340 persisted Location reactivation", () => {
  it("keeps inactive discovery, reactivates once, and rejects foreign/stale writes", async () => {
    const owner = await admin();
    const foreign = await admin();
    const org = owner.member.organizationId;
    const collection = `/v1/staff/management/organizations/${org}/locations`;
    const token = owner.auth.accessToken;
    const created = await fixture.managementPost(collection, token, {
      operationId: randomUUID(),
      name: "Synthetic lifecycle location",
      code: randomUUID().slice(0, 8),
      addressText: "Synthetic lifecycle address",
      currency: "JOD",
      timezone: "Asia/Amman",
    });
    expect(created.status).toBe(201);
    const locationId = String(created.body?.locationId);
    const base = `${collection}/${locationId}`;
    const act = async (action: string, updatedAt: unknown, access = token) =>
      fixture.managementPost(`${base}/${action}`, access, {
        expectedUpdatedAt: String(updatedAt),
      });
    const activated = await act("activate", created.body?.updatedAt);
    expect(activated.body).toMatchObject({
      status: "ACTIVE",
      acceptingIntake: true,
    });
    const stopped = await act("stop-intake", activated.body?.updatedAt);
    const deactivated = await act("deactivate", stopped.body?.updatedAt);
    expect(deactivated.status).toBe(201);
    expect(deactivated.body).toMatchObject({
      status: "INACTIVE",
      acceptingIntake: false,
    });
    expect(
      (await act("deactivate", stopped.body?.updatedAt)).body?.updatedAt,
    ).toBe(deactivated.body?.updatedAt);
    const list = await fixture.managementGet(collection, token);
    expect(list.body?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locationId, status: "INACTIVE" }),
      ]),
    );
    const reload = await fixture.managementGet(`${base}/lifecycle`, token);
    expect(reload.body).toMatchObject({
      status: "INACTIVE",
      addressText: "Synthetic lifecycle address",
    });
    expect(
      (
        await act(
          "activate",
          deactivated.body?.updatedAt,
          foreign.auth.accessToken,
        )
      ).status,
    ).toBe(404);
    const concurrent = await Promise.all([
      act("activate", deactivated.body?.updatedAt),
      act("activate", deactivated.body?.updatedAt),
    ]);
    expect(concurrent.map((entry) => entry.status)).toEqual([201, 201]);
    expect(concurrent[0]?.body?.updatedAt).toBe(concurrent[1]?.body?.updatedAt);
    expect((await act("stop-intake", deactivated.body?.updatedAt)).status).toBe(
      409,
    );
    const final = await fixture.managementGet(`${base}/lifecycle`, token);
    expect(final.body).toMatchObject({
      status: "ACTIVE",
      acceptingIntake: true,
      addressText: "Synthetic lifecycle address",
      updatedAt: concurrent[0]?.body?.updatedAt,
    });
    const history = await fixture.query<{ actor: string; event_type: string }>(
      `SELECT actor_membership_id::text AS actor,event_type FROM audit_events
       WHERE organization_id=$1 AND location_id=$2
         AND event_type IN ('LOCATION_CREATED','LOCATION_ACTIVATED','LOCATION_INTAKE_STOPPED','LOCATION_DEACTIVATED')
       ORDER BY occurred_at,id`,
      [org, locationId],
    );
    expect(history.rows.map((row) => row.event_type)).toEqual([
      "LOCATION_CREATED",
      "LOCATION_ACTIVATED",
      "LOCATION_INTAKE_STOPPED",
      "LOCATION_DEACTIVATED",
      "LOCATION_ACTIVATED",
    ]);
    expect(new Set(history.rows.map((row) => row.actor))).toEqual(
      new Set([owner.member.membershipId]),
    );
  }, 60_000);
});

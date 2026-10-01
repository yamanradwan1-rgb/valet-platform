import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ParkingZoneCreateTestFixture } from "./parking-zone-create-test-fixture";

const fixture = new ParkingZoneCreateTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("Issue #236 current Parking Zone authority", () => {
  it("requires sensitive Company Admin assurance, including on replay", async () => {
    const actor = await fixture.actor("ORG_ADMIN", false);
    const body = { operationId: randomUUID(), code: "ZA", label: "Zone" };
    expect((await fixture.createZone(actor, body)).body?.code).toBe(
      "MFA_STEP_UP_REQUIRED",
    );
    await fixture.enrollAndAssure(actor);
    expect((await fixture.createZone(actor, body)).status).toBe(201);
    await fixture.query(
      "UPDATE staff_auth_sessions SET created_at=mfa_authenticated_at-interval '1 hour',mfa_authenticated_at=mfa_authenticated_at-interval '6 minutes',last_admin_activity_at=mfa_authenticated_at-interval '1 minute' WHERE id=$1",
      [actor.sessionId],
    );
    const replay = await fixture.createZone(actor, body);
    expect(replay.status).toBe(403);
    expect(replay.body?.code).toBe("MFA_STEP_UP_REQUIRED");
  });
  it("allows LM exact grant without MFA and conceals non-granted/foreign targets", async () => {
    const actor = await fixture.actor("LOCATION_MANAGER");
    expect((await fixture.createZone(actor)).status).toBe(201);
    const other = await fixture.addLocation(actor.organizationId);
    const foreign = await fixture.addLocation(
      await fixture.createOrganization(),
    );
    for (const locationId of [other.locationId, foreign.locationId]) {
      const denied = await fixture.createZone({ ...actor, locationId });
      expect(denied.status).toBe(404);
      expect(denied.body?.code).toBe("AUTHORIZATION_DENIED");
    }
  });
  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies %s even with an exact grant",
    async (role) => {
      const actor = await fixture.actor(role);
      const denied = await fixture.createZone(actor);
      expect(denied.status).toBe(404);
      expect(denied.body?.code).toBe("AUTHORIZATION_DENIED");
    },
  );
  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "denies %s inactive Location and foreign Organization",
    async (role) => {
      const actor = await fixture.actor(role);
      const foreign = await fixture.addLocation(
        await fixture.createOrganization(),
      );
      expect(
        (await fixture.createZone({ ...actor, locationId: foreign.locationId }))
          .status,
      ).toBe(404);
      await fixture.query(
        "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1",
        [actor.locationId],
      );
      expect((await fixture.createZone(actor)).status).toBe(404);
    },
  );
  it.each([
    "actor",
    "membership",
    "organization",
    "entitlement",
    "grant",
  ] as const)("reauthorizes before replay after %s loss", async (loss) => {
    const actor = await fixture.actor("LOCATION_MANAGER");
    const body = { operationId: randomUUID(), code: "ZA", label: "Zone" };
    expect((await fixture.createZone(actor, body)).status).toBe(201);
    if (loss === "actor")
      await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
        actor.userId,
      ]);
    if (loss === "membership")
      await fixture.query(
        "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
        [actor.membershipId],
      );
    if (loss === "organization")
      await fixture.query(
        "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
        [actor.organizationId],
      );
    if (loss === "entitlement")
      await fixture.query(
        "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
        [actor.organizationId],
      );
    if (loss === "grant")
      await fixture.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1",
        [actor.membershipId],
      );
    const replay = await fixture.createZone(actor, body);
    expect([401, 404]).toContain(replay.status);
    expect(replay.body).not.toHaveProperty("parkingZoneId");
    const count = await fixture.query<{ count: string }>(
      "SELECT count(*)::text FROM audit_events WHERE location_id=$1 AND event_type='PARKING_ZONE_CREATED'",
      [actor.locationId],
    );
    expect(count.rows[0]?.count).toBe("1");
  });
});

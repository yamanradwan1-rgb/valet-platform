import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  StaffOnboardingTestFixture,
  hidden,
  issued,
  staffPath,
} from "./staff-onboarding-test-fixture";
const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
describe("T05-C current staff/MFA/location authority", () => {
  it("LM requires sensitive MFA and creates only covered Employees/Supervisors", async () => {
    const actor = await fixture.actor("LOCATION_MANAGER", false);
    const command = fixture.command(actor.locationId);
    const denied = await fixture.create(actor, command);
    expect(denied.status).toBe(403);
    expect(denied.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    await fixture.enrollAndAssure(actor.auth);
    expect(
      (
        await fixture.query("SELECT 1 FROM users WHERE email=$1", [
          command.email,
        ])
      ).rowCount,
    ).toBe(0);
    for (const role of ["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)
      issued(
        await fixture.create(
          actor,
          fixture.command(actor.locationId, { role }),
        ),
      );
    hidden(
      await fixture.create(
        actor,
        fixture.command(actor.locationId, { role: "LOCATION_MANAGER" }),
      ),
    );
    const orgAdmin = await fixture.managementPost(
      staffPath(actor.organizationId),
      actor.auth.accessToken,
      { ...command, role: "ORG_ADMIN" },
    );
    expect(orgAdmin.status).toBe(400);
    expect(
      (await fixture.create(actor, { ...command, locationIds: [] })).status,
    ).toBe(400);
    const outside = await fixture.addLocation(actor.organizationId);
    hidden(
      await fixture.create(actor, {
        ...command,
        locationIds: [outside.locationId],
      }),
    );
    hidden(
      await fixture.create(actor, {
        ...command,
        locationIds: [actor.locationId, outside.locationId],
      }),
    );
    await fixture.query(
      "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1",
      [actor.locationId],
    );
    hidden(await fixture.create(actor, command));
  });
  it("CA cannot create ORG_ADMIN and rejects foreign organization/location substitutions", async () => {
    const actor = await fixture.actor();
    expect(
      (
        await fixture.managementPost(
          staffPath(actor.organizationId),
          actor.auth.accessToken,
          { ...fixture.command(actor.locationId), role: "ORG_ADMIN" },
        )
      ).status,
    ).toBe(400);
    const other = await fixture.actor();
    hidden(await fixture.create(actor, fixture.command(other.locationId)));
    hidden(
      await fixture.managementPost(
        staffPath(other.organizationId),
        actor.auth.accessToken,
        fixture.command(other.locationId),
      ),
    );
    const pending = issued(await fixture.create(other));
    hidden(await fixture.resend(actor, pending.membershipId));
  });
  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)(
    "%s cannot issue",
    async (role) => {
      hidden(await fixture.create(await fixture.actor(role, false)));
    },
  );
  it("stale sensitive MFA denies create and replay; entitlement and membership loss reauthorize", async () => {
    const actor = await fixture.actor();
    const command = fixture.command(actor.locationId);
    const fresh = issued(await fixture.create(actor, command));
    await fixture.query(
      "UPDATE staff_auth_sessions SET created_at=clock_timestamp()-INTERVAL '10 minutes',mfa_authenticated_at=clock_timestamp()-INTERVAL '6 minutes' WHERE id=$1",
      [actor.auth.sessionId],
    );
    for (const response of [
      await fixture.create(actor, command),
      await fixture.resend(actor, fresh.membershipId),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body?.code).toBe("MFA_STEP_UP_REQUIRED");
    }
    await fixture.query(
      "UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp(),last_admin_activity_at=clock_timestamp() WHERE id=$1",
      [actor.auth.sessionId],
    );
    await fixture.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
      [actor.organizationId],
    );
    hidden(await fixture.create(actor, command));
    hidden(await fixture.resend(actor, fresh.membershipId));
    await fixture.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE WHERE organization_id=$1",
      [actor.organizationId],
    );
    await fixture.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [actor.membershipId],
    );
    hidden(await fixture.create(actor, command));
  });
});

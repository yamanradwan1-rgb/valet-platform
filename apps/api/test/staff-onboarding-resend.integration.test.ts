import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  StaffOnboardingTestFixture,
  hidden,
  issued,
} from "./staff-onboarding-test-fixture";
const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);
describe("T05-C explicit generation rotation", () => {
  it("reconciles without origin config but fresh issuance rolls back when config is unavailable", async () => {
    const actor = await fixture.actor();
    const command = fixture.command(actor.locationId);
    const fresh = issued(await fixture.create(actor, command));
    const origin = process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
    delete process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
    try {
      const replay = await fixture.create(actor, command);
      expect(replay.body?.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
      expect("activationLink" in replay.body!).toBe(false);
      const newCommand = fixture.command(actor.locationId);
      expect((await fixture.create(actor, newCommand)).body?.code).toBe(
        "STAFF_ONBOARDING_UNAVAILABLE",
      );
      expect(
        (
          await fixture.query("SELECT 1 FROM users WHERE email=$1", [
            newCommand.email,
          ])
        ).rowCount,
      ).toBe(0);
      expect((await fixture.resend(actor, fresh.membershipId)).body?.code).toBe(
        "STAFF_ONBOARDING_UNAVAILABLE",
      );
      const rows = await fixture.query<{ revoked_at: Date | null }>(
        "SELECT revoked_at FROM staff_onboarding_invitations WHERE membership_id=$1",
        [fresh.membershipId],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]?.revoked_at).toBeNull();
    } finally {
      process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN = origin;
    }
  });
  it("serially rotates and reconciles a resend without replacing its secret", async () => {
    const actor = await fixture.actor();
    const first = issued(await fixture.create(actor));
    const operationId = randomUUID();
    const second = issued(
      await fixture.resend(actor, first.membershipId, operationId),
    );
    expect(second.generation).toBe(2);
    expect(second.activationLink === first.activationLink).toBe(false);
    const replay = await fixture.resend(actor, first.membershipId, operationId);
    expect(replay.body?.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
    expect("activationLink" in replay.body!).toBe(false);
    const rows = await fixture.query<{
      generation: number;
      revoked_at: Date | null;
      current: boolean;
    }>(
      "SELECT generation,revoked_at,staff_onboarding_proof_current(id) AS current FROM staff_onboarding_invitations WHERE membership_id=$1 ORDER BY generation",
      [first.membershipId],
    );
    expect(
      rows.rows.map((row) => [
        row.generation,
        row.revoked_at !== null,
        row.current,
      ]),
    ).toEqual([
      [1, true, false],
      [2, false, true],
    ]);
    const audit = await fixture.query<{ event_type: string }>(
      "SELECT event_type FROM audit_events WHERE entity_id=$1 ORDER BY occurred_at",
      [first.membershipId],
    );
    expect(audit.rows.map((row) => row.event_type)).toEqual([
      "STAFF_ONBOARDING_INVITATION_ISSUED",
      "STAFF_ONBOARDING_INVITATION_RESENT",
    ]);
  });
  it("expired/consumed/revoked generations cannot provide current proof, expired lineage can explicitly resend", async () => {
    const actor = await fixture.actor();
    const fresh = issued(await fixture.create(actor));
    await fixture.query(
      "UPDATE staff_onboarding_invitations SET created_at=clock_timestamp()-INTERVAL '26 hours',expires_at=clock_timestamp()-INTERVAL '2 hours' WHERE id=$1",
      [fresh.invitationId],
    );
    expect(
      (
        await fixture.query<{ current: boolean }>(
          "SELECT staff_onboarding_proof_current($1) AS current",
          [fresh.invitationId],
        )
      ).rows[0]?.current,
    ).toBe(false);
    const second = issued(await fixture.resend(actor, fresh.membershipId));
    expect(second.generation).toBe(2);
    await fixture.query(
      "UPDATE staff_onboarding_invitations SET consumed_at=clock_timestamp() WHERE id=$1",
      [second.invitationId],
    );
    expect(
      (
        await fixture.query<{ current: boolean }>(
          "SELECT staff_onboarding_proof_current($1) AS current",
          [second.invitationId],
        )
      ).rows[0]?.current,
    ).toBe(false);
    expect((await fixture.resend(actor, fresh.membershipId)).body?.code).toBe(
      "STAFF_ONBOARDING_UNAVAILABLE",
    );
  });
  it("resend audit failure restores the previous verifier and generation", async () => {
    const actor = await fixture.actor();
    const fresh = issued(await fixture.create(actor));
    await fixture.query(
      "ALTER TABLE audit_events ADD CONSTRAINT t05c_fail_resend CHECK(event_type <> 'STAFF_ONBOARDING_INVITATION_RESENT') NOT VALID",
    );
    try {
      expect(
        (await fixture.resend(actor, fresh.membershipId)).status,
      ).toBeGreaterThanOrEqual(400);
      const rows = await fixture.query<{ revoked_at: Date | null }>(
        "SELECT revoked_at FROM staff_onboarding_invitations WHERE membership_id=$1",
        [fresh.membershipId],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]?.revoked_at).toBeNull();
    } finally {
      await fixture.query(
        "ALTER TABLE audit_events DROP CONSTRAINT t05c_fail_resend",
      );
    }
  });
  it("LM target coverage/role loss and target leaving pending deny rotation and replay", async () => {
    const actor = await fixture.actor("LOCATION_MANAGER");
    const fresh = issued(await fixture.create(actor));
    const operationId = randomUUID();
    issued(await fixture.resend(actor, fresh.membershipId, operationId));
    const outside = await fixture.addLocation(actor.organizationId);
    await fixture.grant(
      actor.organizationId,
      fresh.membershipId,
      outside.locationId,
    );
    hidden(await fixture.resend(actor, fresh.membershipId, operationId));
    hidden(await fixture.resend(actor, fresh.membershipId));
    await fixture.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [fresh.membershipId, outside.locationId],
    );
    await fixture.query(
      "UPDATE organization_memberships SET status='ACTIVE' WHERE id=$1",
      [fresh.membershipId],
    );
    hidden(await fixture.resend(actor, fresh.membershipId));
  });
});

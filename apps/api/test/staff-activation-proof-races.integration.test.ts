import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import {
  StaffActivationTestFixture,
  invitationToken,
} from "./staff-activation-test-fixture";
import { issued } from "./staff-onboarding-test-fixture";

const fixture = new StaffActivationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-D authoritative proof rechecks after preflight", () => {
  it.each([
    "password",
    "disabled",
    "membership",
    "organization",
    "expiry",
  ] as const)(
    "rejects concurrent %s change before commit",
    async (kind) => {
      const actor = await fixture.actor();
      const existing = await fixture.createUser();
      const invite = issued(
        await fixture.create(
          actor,
          fixture.command(actor.locationId, { email: existing.email }),
        ),
      );
      const lock = await fixture.userBarrier(invite.membershipId);
      const request = fixture.activate(
        invitationToken(invite.activationLink),
        existing.password,
      );
      await fixture.waitBlocked(1);
      try {
        if (kind === "password")
          await lock.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
            existing.id,
            await hashStaffPassword("New unrelated current password!"),
          ]);
        if (kind === "disabled")
          await lock.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
            existing.id,
          ]);
        if (kind === "membership")
          await lock.query(
            "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
            [invite.membershipId],
          );
        if (kind === "organization")
          await lock.query(
            "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
            [actor.organizationId],
          );
        if (kind === "expiry")
          await lock.query(
            "UPDATE staff_onboarding_invitations SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",
            [invite.invitationId],
          );
        await lock.query("COMMIT");
      } finally {
        await lock.end();
      }
      expect((await request).status).toBe(401);
      const state = await fixture.snapshot(invite.membershipId);
      expect([state.version, state.consumed, state.audits]).toEqual([1, 0, 0]);
    },
    30_000,
  );

  it("a global User becoming ACTIVE after pending preflight cannot have its password overwritten", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const lock = await fixture.userBarrier(invite.membershipId);
    const request = fixture.activate(invitationToken(invite.activationLink));
    await fixture.waitBlocked(1);
    const established = await hashStaffPassword(
      "A different owner's password!",
    );
    await lock.query(
      "UPDATE users SET status='ACTIVE',password_hash=$2 WHERE id=(SELECT user_id FROM organization_memberships WHERE id=$1)",
      [invite.membershipId, established],
    );
    await lock.query("COMMIT");
    await lock.end();
    expect((await request).status).toBe(401);
    const state = await fixture.snapshot(invite.membershipId);
    expect(state.password_hash === established).toBe(true);
    expect([state.version, state.consumed, state.audits]).toEqual([1, 0, 0]);
  }, 30_000);
});

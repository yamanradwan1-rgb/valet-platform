import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { staffInvitationHash } from "../src/modules/management/staff-invitation-credential";
import {
  StaffActivationTestFixture,
  invitationToken,
  ACTIVATION_PASSWORD,
} from "./staff-activation-test-fixture";
import { issued } from "./staff-onboarding-test-fixture";

const fixture = new StaffActivationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function release(client: Client) {
  await client.query("COMMIT");
  await client.end();
}

describe("T05-D PostgreSQL activation serialization", () => {
  it.each(["activation", "resend"] as const)(
    "%s wins before the other command",
    async (first) => {
      const actor = await fixture.actor();
      const invite = issued(await fixture.create(actor));
      const token = invitationToken(invite.activationLink);
      const lock = await fixture.barrier(actor.organizationId);
      const one =
        first === "activation"
          ? fixture.activate(token)
          : fixture.resend(actor, invite.membershipId);
      await fixture.waitBlocked(1);
      const two =
        first === "activation"
          ? fixture.resend(actor, invite.membershipId)
          : fixture.activate(token);
      await fixture.waitBlocked(2);
      await release(lock);
      const winner = await one,
        loser = await two;
      const state = await fixture.snapshot(invite.membershipId);
      if (first === "activation") {
        expect(winner.status).toBe(200);
        expect(loser.status).toBe(404);
        expect(state.consumed).toBe(1);
        expect(state.audits).toBe(1);
      } else {
        const rotated = issued(winner);
        expect(loser.status).toBe(401);
        expect(state.consumed).toBe(0);
        expect(state.status).toBe("PENDING");
        expect(
          (await fixture.activate(invitationToken(rotated.activationLink)))
            .status,
        ).toBe(200);
      }
      expect((await fixture.snapshot(invite.membershipId)).audits).toBe(1);
    },
    30_000,
  );

  it("concurrent same token initializes once; explicit retry reconciles with current password", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const token = invitationToken(invite.activationLink);
    const lock = await fixture.barrier(actor.organizationId);
    const one = fixture.activate(token);
    await fixture.waitBlocked(1);
    const two = fixture.activate(token);
    await fixture.waitBlocked(2);
    await release(lock);
    expect((await one).status).toBe(200);
    expect((await two).status).toBe(401);
    expect((await fixture.activate(token)).body?.outcome).toBe(
      "ALREADY_ACTIVATED",
    );
    const state = await fixture.snapshot(invite.membershipId);
    expect([
      state.version,
      state.consumed,
      state.audits,
      state.sessions,
    ]).toEqual([2, 1, 1, 0]);
  }, 30_000);

  it.each([false, true])(
    "same global pending User in two organizations, same password=%s",
    async (samePassword) => {
      const a = await fixture.actor(),
        b = await fixture.actor();
      const command = fixture.command(a.locationId);
      const oneInvite = issued(await fixture.create(a, command));
      const twoInvite = issued(
        await fixture.create(
          b,
          fixture.command(b.locationId, { email: command.email }),
        ),
      );
      const lock = await fixture.barrier(a.organizationId);
      const one = fixture.activate(invitationToken(oneInvite.activationLink));
      await fixture.waitBlocked(1);
      const secondPassword = samePassword
        ? ACTIVATION_PASSWORD
        : "Different chosen password 240D!";
      const two = fixture.activate(
        invitationToken(twoInvite.activationLink),
        secondPassword,
      );
      await fixture.waitBlocked(2);
      await release(lock);
      expect((await one).status).toBe(200);
      const established = await fixture.snapshot(oneInvite.membershipId);
      expect((await two).status).toBe(401);
      expect(
        (await fixture.snapshot(twoInvite.membershipId)).password_hash ===
          established.password_hash,
      ).toBe(true);
      expect((await fixture.snapshot(twoInvite.membershipId)).status).toBe(
        "PENDING",
      );
      if (!samePassword)
        expect(
          (
            await fixture.activate(
              invitationToken(twoInvite.activationLink),
              secondPassword,
            )
          ).status,
        ).toBe(401);
      expect(
        (await fixture.activate(invitationToken(twoInvite.activationLink)))
          .status,
      ).toBe(200);
      expect(
        (await fixture.snapshot(twoInvite.membershipId)).password_hash ===
          established.password_hash,
      ).toBe(true);
    },
    30_000,
  );

  it("a waiting activation succeeds after an uncommitted activation rolls back", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const token = invitationToken(invite.activationLink);
    const runtime = new Client({
      connectionString: fixture.runtimeDatabaseUrl(),
    });
    await runtime.connect();
    await runtime.query("BEGIN");
    try {
      await runtime.query("SELECT staff_onboarding_activate($1,NULL,$2)", [
        staffInvitationHash(token),
        await hashStaffPassword(ACTIVATION_PASSWORD),
      ]);
      const waiting = fixture.activate(token);
      await fixture.waitBlocked(1);
      await runtime.query("ROLLBACK");
      expect((await waiting).status).toBe(200);
      const state = await fixture.snapshot(invite.membershipId);
      expect([
        state.version,
        state.consumed,
        state.audits,
        state.sessions,
      ]).toEqual([2, 1, 1, 0]);
    } finally {
      await runtime.query("ROLLBACK");
      await runtime.end();
    }
  }, 30_000);
});

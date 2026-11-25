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
import { staffRaceBarrierCloser } from "./staff-race-lock-observer";

const fixture = new StaffActivationTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-D PostgreSQL activation serialization", () => {
  it.each(["activation", "resend"] as const)(
    "%s wins before the other command",
    async (first) => {
      const actor = await fixture.actor();
      const invite = issued(await fixture.create(actor));
      const token = invitationToken(invite.activationLink);
      // Stage both commands at their shared account lock. An organization
      // barrier can block resend preflight while activation overtakes it.
      const lock = await fixture.memberEmailBarrier(invite.membershipId);
      const barrier = staffRaceBarrierCloser(lock);
      let one: ReturnType<typeof fixture.activate> | undefined;
      let two: ReturnType<typeof fixture.activate> | undefined;
      try {
        one =
          first === "activation"
            ? fixture.activate(token)
            : fixture.resend(actor, invite.membershipId);
        void one.catch(() => undefined);
        await fixture.waitActivationBlocked(1, lock);
        two =
          first === "activation"
            ? fixture.resend(actor, invite.membershipId)
            : fixture.activate(token);
        void two.catch(() => undefined);
        await fixture.waitActivationBlocked(2, lock);
        await barrier.close("COMMIT");
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
      } finally {
        await barrier.close("ROLLBACK").catch(() => undefined);
        await Promise.allSettled([one, two].filter((request) => request !== undefined));
      }
    },
    30_000,
  );

  it("concurrent same token initializes once; explicit retry reconciles with current password", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const token = invitationToken(invite.activationLink);
    const lock = await fixture.barrier(actor.organizationId);
    const barrier = staffRaceBarrierCloser(lock);
    let one: ReturnType<typeof fixture.activate> | undefined;
    let two: ReturnType<typeof fixture.activate> | undefined;
    try {
      one = fixture.activate(token);
      void one.catch(() => undefined);
      await fixture.waitActivationBlocked(1, lock);
      two = fixture.activate(token);
      void two.catch(() => undefined);
      await fixture.waitActivationBlocked(2, lock);
      await barrier.close("COMMIT");
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
    } finally {
      await barrier.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled([one, two].filter((request) => request !== undefined));
    }
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
      const lock = await fixture.memberEmailBarrier(oneInvite.membershipId);
      const barrier = staffRaceBarrierCloser(lock);
      let one: ReturnType<typeof fixture.activate> | undefined;
      let two: ReturnType<typeof fixture.activate> | undefined;
      try {
        one = fixture.activate(invitationToken(oneInvite.activationLink));
        void one.catch(() => undefined);
        await fixture.waitActivationBlocked(1, lock);
        const secondPassword = samePassword
          ? ACTIVATION_PASSWORD
          : "Different chosen password 240D!";
        two = fixture.activate(
          invitationToken(twoInvite.activationLink),
          secondPassword,
        );
        void two.catch(() => undefined);
        await fixture.waitActivationBlocked(2, lock);
        await barrier.close("COMMIT");
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
      } finally {
        await barrier.close("ROLLBACK").catch(() => undefined);
        await Promise.allSettled([one, two].filter((request) => request !== undefined));
      }
    },
    30_000,
  );

  it("a waiting activation succeeds after an uncommitted activation rolls back", async () => {
    const actor = await fixture.actor();
    const invite = issued(await fixture.create(actor));
    const token = invitationToken(invite.activationLink);
    // The concurrency barrier intentionally uses fixture administrator authority;
    // the ordinary SQL runtime must never call this activation function.
    const runtime = new Client({
      connectionString: fixture.migrationDatabaseUrl(),
    });
    await runtime.connect();
    const barrier = staffRaceBarrierCloser(runtime);
    let waiting: ReturnType<typeof fixture.activate> | undefined;
    try {
      await runtime.query("BEGIN");
      await runtime.query("SELECT staff_onboarding_activate($1,NULL,$2)", [
        staffInvitationHash(token),
        await hashStaffPassword(ACTIVATION_PASSWORD),
      ]);
      waiting = fixture.activate(token);
      void waiting.catch(() => undefined);
      await fixture.waitActivationBlocked(1, runtime);
      await barrier.close("ROLLBACK");
      expect((await waiting).status).toBe(200);
      const state = await fixture.snapshot(invite.membershipId);
      expect([
        state.version,
        state.consumed,
        state.audits,
        state.sessions,
      ]).toEqual([2, 1, 1, 0]);
    } finally {
      await barrier.close("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(waiting === undefined ? [] : [waiting]);
    }
  }, 30_000);
});

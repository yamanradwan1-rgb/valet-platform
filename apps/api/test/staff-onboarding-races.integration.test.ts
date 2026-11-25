import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { staffOnboardingCreateSchema } from "@valet/contracts";
import { staffOnboardingCreateFingerprint } from "../src/modules/management/staff-onboarding-policy";
import {
  generateStaffInvitationToken,
  staffInvitationHash,
} from "../src/modules/management/staff-invitation-credential";
import {
  StaffOnboardingTestFixture,
  hidden,
  issued,
} from "./staff-onboarding-test-fixture";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";
const fixture = new StaffOnboardingTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function waitBehind(
  blocker: Client,
  expectedWaiters: number,
  firstWaiterPid?: number,
) {
  const result = await blocker.query<{ readonly pid: number }>(
    "SELECT pg_backend_pid() AS pid",
  );
  const blockerPid = result.rows[0]?.pid;
  if (blockerPid === undefined) throw new Error("Race blocker PID is missing.");
  if (firstWaiterPid !== undefined) {
    // The second backend may queue directly behind the barrier (hard block),
    // or behind the first waiter (soft queue edge). Prove either real edge
    // while the first backend remains blocked behind the original barrier.
    const deadline = performance.now() + 10_000;
    while (performance.now() < deadline) {
      const observed = await fixture.databasePool().query<{
        pid: number;
        blockers: number[];
      }>(
        `SELECT activity.pid, pg_blocking_pids(activity.pid) AS blockers
         FROM pg_stat_activity AS activity
         WHERE activity.datname = current_database()
           AND activity.pid <> pg_backend_pid()`,
      );
      const first = observed.rows.find((row) => row.pid === firstWaiterPid);
      if (first?.blockers.includes(blockerPid)) {
        const second = observed.rows.find(
          (row) =>
            row.pid !== blockerPid &&
            row.pid !== firstWaiterPid &&
            (row.blockers.includes(blockerPid) ||
              row.blockers.includes(firstWaiterPid)),
        );
        if (second !== undefined) return second.pid;
      }
      await pause(20);
    }
    throw new Error("Onboarding second waiter lacks a real causal queue edge.");
  }
  const waiters = await waitForPostgresBlockingEdge(fixture.databasePool(), {
    blockerPid,
    expectedWaiters,
  });
  return waiters[0]!;
}

describe("T05-C real two connection serialization", () => {
  it("concurrent same-email creates in distinct tenants share one global pending User", async () => {
    const one = await fixture.actor();
    const two = await fixture.actor();
    const command = fixture.command(one.locationId);
    // Both tenants must reach the shared email lock before release; an
    // Organization barrier cannot stop the other tenant proceeding first.
    const lock = await fixture.emailBarrier(command.email);
    const firstRequest = fixture.create(one, command);
    const firstWaiterPid = await waitBehind(lock, 1);
    const secondRequest = fixture.create(
      two,
      fixture.command(two.locationId, { email: command.email.toUpperCase() }),
    );
    await waitBehind(lock, 2, firstWaiterPid);
    await lock.query("COMMIT");
    await lock.end();
    const first = issued(await firstRequest),
      second = issued(await secondRequest);
    const rows = await fixture.query<{ n: string }>(
      "SELECT count(DISTINCT user_id)::text AS n FROM organization_memberships WHERE id=ANY($1::uuid[])",
      [[first.membershipId, second.membershipId]],
    );
    expect(rows.rows[0]?.n).toBe("1");
    expect(
      (
        await fixture.query("SELECT 1 FROM users WHERE email=$1", [
          command.email,
        ])
      ).rowCount,
    ).toBe(1);
    expect(JSON.stringify(second).includes(one.organizationId)).toBe(false);
  }, 30_000);
  it.each(["identical", "conflicting", "same-email"] as const)(
    "serializes concurrent %s create requests",
    async (kind) => {
      const actor = await fixture.actor();
      const command = fixture.command(actor.locationId);
      const second =
        kind === "conflicting"
          ? { ...command, firstName: "Different" }
          : kind === "same-email"
            ? {
                ...command,
                operationId: randomUUID(),
                email: command.email.toUpperCase(),
              }
            : command;
      // Different operation IDs for the same email must serialize on the
      // account key. Existing identical/conflicting op IDs also test org scope.
      const lock =
        kind === "same-email"
          ? await fixture.emailBarrier(command.email)
          : await fixture.barrier(actor.organizationId);
      const firstRequest = fixture.create(actor, command);
      const firstWaiterPid = await waitBehind(lock, 1);
      const secondRequest = fixture.create(actor, second);
      await waitBehind(lock, 2, firstWaiterPid);
      await lock.query("COMMIT");
      await lock.end();
      const first = issued(await firstRequest);
      const response = await secondRequest;
      if (kind === "identical") {
        expect(response.status).toBe(201);
        expect(response.body?.outcome).toBe("INVITE_PENDING_LINK_UNAVAILABLE");
        expect(response.body?.invitationId).toBe(first.invitationId);
      } else {
        expect(response.status).toBe(409);
        expect(response.body?.code).toBe(
          kind === "conflicting"
            ? "IDEMPOTENCY_CONFLICT"
            : "STAFF_ONBOARDING_UNAVAILABLE",
        );
      }
      const rows = await fixture.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM users WHERE email=$1",
        [command.email],
      );
      expect(rows.rows[0]?.n).toBe("1");
      expect(
        (
          await fixture.query(
            "SELECT 1 FROM staff_onboarding_invitations WHERE membership_id=$1",
            [first.membershipId],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await fixture.query("SELECT 1 FROM audit_events WHERE entity_id=$1", [
            first.membershipId,
          ])
        ).rowCount,
      ).toBe(1);
    },
    30_000,
  );
  it.each(["create", "resend"] as const)(
    "LM %s rechecks when grant revocation commits before the waiting command",
    async (kind) => {
      const actor = await fixture.actor("LOCATION_MANAGER");
      const pending =
        kind === "resend" ? issued(await fixture.create(actor)) : undefined;
      const command = fixture.command(actor.locationId);
      const lock = await fixture.barrier(actor.organizationId);
      const request = pending
        ? fixture.resend(actor, pending.membershipId)
        : fixture.create(actor, command);
      await waitBehind(lock, 1);
      await lock.query(
        "DELETE FROM membership_location_access WHERE membership_id=$1",
        [actor.membershipId],
      );
      await lock.query("COMMIT");
      await lock.end();
      hidden(await request);
      expect(
        (
          await fixture.query("SELECT 1 FROM users WHERE email=$1", [
            command.email,
          ])
        ).rowCount,
      ).toBe(0);
      if (pending)
        expect(
          (
            await fixture.query(
              "SELECT 1 FROM staff_onboarding_invitations WHERE membership_id=$1",
              [pending.membershipId],
            )
          ).rowCount,
        ).toBe(1);
    },
    30_000,
  );
  it.each(["create", "resend"] as const)(
    "entitlement loss before waiting %s commits prevents issuance",
    async (kind) => {
      const actor = await fixture.actor();
      const pending =
        kind === "resend" ? issued(await fixture.create(actor)) : undefined;
      const lock = await fixture.barrier(actor.organizationId);
      const request = pending
        ? fixture.resend(actor, pending.membershipId)
        : fixture.create(actor);
      await waitBehind(lock, 1);
      await lock.query(
        "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
        [actor.organizationId],
      );
      await lock.query("COMMIT");
      await lock.end();
      hidden(await request);
    },
    30_000,
  );
  it("concurrent different resends leave monotonic history with only newest current", async () => {
    const actor = await fixture.actor();
    const fresh = issued(await fixture.create(actor));
    const lock = await fixture.barrier(actor.organizationId);
    const one = fixture.resend(actor, fresh.membershipId);
    const firstWaiterPid = await waitBehind(lock, 1);
    const two = fixture.resend(actor, fresh.membershipId);
    await waitBehind(lock, 2, firstWaiterPid);
    await lock.query("COMMIT");
    await lock.end();
    expect(
      [issued(await one).generation, issued(await two).generation].sort(),
    ).toEqual([2, 3]);
    const rows = await fixture.query<{ generation: number; revoked: boolean }>(
      "SELECT generation,revoked_at IS NOT NULL AS revoked FROM staff_onboarding_invitations WHERE membership_id=$1 ORDER BY generation",
      [fresh.membershipId],
    );
    expect(rows.rows).toEqual([
      { generation: 1, revoked: true },
      { generation: 2, revoked: true },
      { generation: 3, revoked: false },
    ]);
    expect(
      (
        await fixture.query("SELECT 1 FROM audit_events WHERE entity_id=$1", [
          fresh.membershipId,
        ])
      ).rowCount,
    ).toBe(3);
  }, 30_000);
  it("a waiting identical command issues once after the uncommitted winner rolls back", async () => {
    const actor = await fixture.actor();
    const command = staffOnboardingCreateSchema.parse(
      fixture.command(actor.locationId),
    );
    const writerUrl = process.env.MANAGEMENT_WRITER_DATABASE_URL;
    if (!writerUrl) {
      throw new Error("Onboarding race requires the isolated Management writer fixture.");
    }
    const client = new Client({
      connectionString: writerUrl,
    });
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query(
        `SELECT * FROM staff_management_authorized_onboarding_create(
           $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,
           $7::text,$8::text,$9::text,$10::text,$11::membership_role,
           $12::uuid[],$13::text)`,
        [
          actor.auth.sessionId,
          actor.user.id,
          actor.auth.accessToken,
          actor.membershipId,
          actor.organizationId,
          command.operationId,
          staffOnboardingCreateFingerprint(actor.organizationId, command),
          command.email,
          command.firstName,
          command.lastName,
          command.role,
          command.locationIds,
          staffInvitationHash(generateStaffInvitationToken()),
        ],
      );
      const waiting = fixture.create(actor, command);
      await waitBehind(client, 1);
      await client.query("ROLLBACK");
      const result = issued(await waiting);
      expect(result.generation).toBe(1);
      expect(
        (
          await fixture.query("SELECT 1 FROM users WHERE email=$1", [
            command.email,
          ])
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await fixture.query("SELECT 1 FROM audit_events WHERE entity_id=$1", [
            result.membershipId,
          ])
        ).rowCount,
      ).toBe(1);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  }, 30_000);
});

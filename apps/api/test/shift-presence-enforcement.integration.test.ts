import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";

const db = new PresenceServerTestContext("presence-enforcement");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterAll(() => db.teardown(), 60_000);

describe("authoritative presence composition with real forward-migrated PostgreSQL", () => {
  it.each(["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
    "old START and END bodies obey %s",
    async (mode) => {
      const fixture = await db.createFixture();
      const shift = await db.start(fixture);
      await db.policy(fixture, mode);
      if (mode === "REQUIRE" || mode === "REQUIRE_OR_OVERRIDE") {
        await expect(db.end(fixture, shift.shiftId)).rejects.toMatchObject({
          code: "PRESENCE_REQUIRED",
        });
        const other = await db.createFixture();
        await db.policy(other, mode);
        await expect(db.start(other)).rejects.toMatchObject({
          code: "PRESENCE_REQUIRED",
        });
        expect(await db.facts(other)).toEqual({
          shifts: 0,
          decisions: 0,
          starts: 0,
          ends: 0,
        });
      } else {
        await db.end(fixture, shift.shiftId);
        const started = await db.start(fixture);
        expect(started.status).toBe("ACTIVE");
        const rows = await db.adminPool.query(
          `SELECT classification,reason FROM shift_presence_decisions WHERE membership_id=$1`,
          [fixture.membershipId],
        );
        expect(rows.rowCount).toBe(mode === "OFF" ? 0 : 2);
        for (const row of rows.rows)
          expect(row).toEqual({
            classification: "MEASUREMENT_UNUSABLE",
            reason: "INVALID_FIX",
          });
      }
    },
  );
  it("commits a real inside START once and recovers its original result after END and restart", async () => {
    const fixture = await db.createFixture();
    await db.policy(fixture, "REQUIRE");
    await db.zone(fixture);
    const { context } = await db.session(fixture.userId);
    const challenge = await db.challenge(fixture, context);
    const evidence = db.measured(challenge);
    const first = await db.start(fixture, context, evidence);
    await db.policy(fixture, "OFF");
    await db.end(fixture, first.shiftId);
    const retry = await createStartShiftCommandExecutor(db.runtimePool)({
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
      presence: evidence,
      sessionContext: context,
    });
    expect(retry).toEqual(first);
    expect(await db.facts(fixture)).toEqual({
      shifts: 1,
      decisions: 1,
      starts: 1,
      ends: 1,
    });
    await expect(
      db.start(fixture, context, { ...evidence, clientSampleId: randomUUID() }),
    ).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    const status = await db.presence.status(context, challenge.operationId);
    expect(status).toMatchObject({
      state: "RECOVERABLE",
      status: "COMMITTED",
      result: { status: "ACTIVE", shiftId: first.shiftId },
    });
  });
  it("same-Location ACTIVE recovery leaves a new presence operation and challenge untouched", async () => {
    const fixture = await db.createFixture();
    const first = await db.start(fixture);
    const { context } = await db.session(fixture.userId);
    const challenge = await db.challenge(fixture, context);
    await db.policy(fixture, "REQUIRE");
    expect(await db.start(fixture, context, db.measured(challenge))).toEqual(
      first,
    );
    expect(
      await db.presence.status(context, challenge.operationId),
    ).toMatchObject({ state: "PENDING" });
    expect(await db.facts(fixture)).toEqual({
      shifts: 1,
      decisions: 0,
      starts: 1,
      ends: 0,
    });
  });
  it.each([32.1, 31.95088])(
    "outside or ambiguous evidence cannot create a strict Shift at latitude %s",
    async (latitude) => {
      const fixture = await db.createFixture();
      await db.policy(fixture, "REQUIRE");
      await db.zone(fixture);
      const { context } = await db.session(fixture.userId);
      const challenge = await db.challenge(fixture, context);
      await expect(
        db.start(fixture, context, db.measured(challenge, latitude)),
      ).rejects.toMatchObject({ code: "PRESENCE_REJECTED" });
      expect(await db.facts(fixture)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
      expect(
        await db.presence.status(context, challenge.operationId),
      ).toMatchObject({
        state: "RECOVERABLE",
        status: "DENIED",
        denialReason: "PRESENCE_REJECTED",
        result: null,
      });
    },
  );
  it("cash precision denial preserves evidence; identical END recovers, changed cash conflicts", async () => {
    const fixture = await db.createFixture();
    const shift = await db.start(fixture);
    await db.policy(fixture, "OFF", "REQUIRE");
    await db.zone(fixture);
    const { context } = await db.session(fixture.userId);
    const challenge = await db.challenge(
      fixture,
      context,
      shift.shiftId,
      "0.001",
    );
    const evidence = db.measured(challenge);
    await db.adminPool.query(
      `UPDATE locations SET currency='USD' WHERE id=$1`,
      [fixture.locationId],
    );
    await expect(
      db.end(fixture, shift.shiftId, "0.001", evidence),
    ).rejects.toMatchObject({ code: "SHIFT_CASH_REPORT_INVALID" });
    expect(
      await db.presence.status(context, challenge.operationId),
    ).toMatchObject({ state: "PENDING" });
    await db.adminPool.query(
      `UPDATE locations SET currency='JOD' WHERE id=$1`,
      [fixture.locationId],
    );
    const ended = await db.end(fixture, shift.shiftId, "0.001", evidence);
    expect(await db.end(fixture, shift.shiftId, "0.001", evidence)).toEqual(
      ended,
    );
    await expect(
      db.end(fixture, shift.shiftId, "0.002", evidence),
    ).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    expect(await db.facts(fixture)).toEqual({
      shifts: 1,
      decisions: 1,
      starts: 1,
      ends: 1,
    });
  });
  it("an audit failure rolls back Shift, Decision, challenge and result before commit", async () => {
    const fixture = await db.createFixture();
    await db.policy(fixture, "REQUIRE");
    await db.zone(fixture);
    const { context } = await db.session(fixture.userId);
    const challenge = await db.challenge(fixture, context);
    const evidence = db.measured(challenge);
    const duplicate = randomUUID();
    await db.adminPool.query(
      `INSERT INTO audit_events(id,organization_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
      VALUES($1,$2,'SYSTEM','TEST_FAILURE','Organization',$2,'{}',clock_timestamp())`,
      [duplicate, fixture.organizationId],
    );
    await expect(
      createStartShiftCommandExecutor(db.runtimePool, {
        auditEventIdFactory: () => duplicate,
      })({
        authenticatedUserId: fixture.userId,
        targetLocationId: fixture.locationId,
        presence: evidence,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    expect(await db.facts(fixture)).toEqual({
      shifts: 0,
      decisions: 0,
      starts: 0,
      ends: 0,
    });
    expect(
      await db.presence.status(context, challenge.operationId),
    ).toMatchObject({ state: "PENDING" });
    expect(
      (
        await db.adminPool.query(
          `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
          [challenge.challengeId],
        )
      ).rows[0].consumed_at,
    ).toBeNull();
  });
  it("rotated deployment keys preserve exact pending and terminal attempt comparison", async () => {
    const fixture = await db.createFixture();
    await db.policy(fixture, "REQUIRE");
    await db.zone(fixture);
    const { context } = await db.session(fixture.userId);
    const challenge = await db.challenge(fixture, context);
    const evidence = db.measured(challenge);
    const original = process.env.SHIFT_PRESENCE_FINGERPRINT_KEY!;
    process.env.SHIFT_PRESENCE_FINGERPRINT_KEY = Buffer.alloc(32, 9).toString(
      "base64",
    );
    process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS = JSON.stringify([
      original,
    ]);
    try {
      const first = await db.start(fixture, context, evidence);
      expect(await db.start(fixture, context, evidence)).toEqual(first);
    } finally {
      process.env.SHIFT_PRESENCE_FINGERPRINT_KEY = original;
      delete process.env.SHIFT_PRESENCE_PREVIOUS_FINGERPRINT_KEYS;
    }
  });
  it("safe-own END remains usable after detached membership and revoked Location access in OFF", async () => {
    const fixture = await db.createFixture();
    const shift = await db.start(fixture);
    await db.adminPool.query(
      `DELETE FROM membership_location_access WHERE membership_id=$1`,
      [fixture.membershipId],
    );
    await db.adminPool.query(
      `UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
      [fixture.membershipId],
    );
    expect(
      (
        await createEndShiftCommandExecutor(db.runtimePool)({
          authenticatedUserId: fixture.userId,
          shiftId: shift.shiftId,
          cashReported: "0",
        })
      ).status,
    ).toBe("ENDED");
  });
});

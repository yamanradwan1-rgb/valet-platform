import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";
import { presenceTransaction } from "./shift-presence-test-helpers";

const db = new PresenceServerTestContext("presence-convergence-proof");
beforeAll(async () => {
  await db.setup();
}, 120_000);
afterEach(abortPresenceCommitBarriers);
afterAll(() => db.teardown(), 60_000);

describe("no-effect success never evaluates or consumes another proof", () => {
  it.each(["START", "END"] as const)(
    "%s winning measured O1 does not consume O2's approved exception",
    async (action) => {
      const c = await noEvidenceCase(db, action);
      const second = await db.challenge(
        c.f,
        c.auth.context,
        c.shift?.shiftId,
        "7",
      );
      await db.policy(c.f, "REQUIRE_OR_OVERRIDE");
      await db.zone(c.f);
      const exception = await db.presence.requestException(
        c.auth.context,
        second.operationId,
        { challengeId: second.challengeId, reason: "GPS_UNAVAILABLE" },
      );
      const manager = await db.manager(c.f);
      await db.management.review(
        manager.context,
        manager.target,
        String(exception.exceptionId),
        { mutationId: randomUUID(), expectedRevision: 1 },
        "APPROVED",
      );
      const gate = presenceCommitBarrier(db.runtimePool);
      const identity = {
        authenticatedUserId: c.f.userId,
        sessionContext: c.auth.context,
      };
      const evidence = db.measured(c.challenge);
      const winner =
        action === "START"
          ? createStartShiftCommandExecutor(gate.pool)({
              ...identity,
              targetLocationId: c.f.locationId,
              presence: evidence,
            })
          : createEndShiftCommandExecutor(gate.pool)({
              ...identity,
              shiftId: c.shift!.shiftId,
              cashReported: "7",
              presence: evidence,
            });
      await gate.atCommit;
      const old = await presenceHttp(db);
      const path =
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${c.shift!.shiftId}/end`;
      const presence = {
        kind: "EXCEPTION" as const,
        operationId: second.operationId,
        challengeId: second.challengeId,
        exceptionId: exception.exceptionId,
      };
      const body =
        action === "START"
          ? { targetLocationId: c.f.locationId, presence }
          : { cashReported: "7", presence };
      const lost = old
        .request("POST", path, c.auth.token, body, "DISCONNECT")
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish("COMMIT");
      const original = await winner;
      expect(await lost).toBeInstanceOf(Error);
      await old.app.close();
      const fresh = await presenceHttp(db);
      try {
        const read = await fresh.request(
          "GET",
          `/v1/staff/shifts/presence/operations/${second.operationId}`,
          c.auth.token,
        );
        expect(read.status).toBe(200);
        expect(read.body).toMatchObject({
          state: "RECOVERABLE",
          status: "COMMITTED",
          decisionId: null,
          result: { shiftId: original.shiftId },
        });
        expect(
          (
            await db.presence.exception(
              c.auth.context,
              String(exception.exceptionId),
            )
          ).status,
        ).toBe("APPROVED");
        expect(
          (
            await db.adminPool.query(
              `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
              [second.challengeId],
            )
          ).rows[0].consumed_at,
        ).toBeNull();
        expect(
          (
            await db.adminPool.query(
              `SELECT operation_id FROM shift_presence_decisions WHERE membership_id=$1`,
              [c.f.membershipId],
            )
          ).rows,
        ).toEqual([{ operation_id: c.challenge.operationId }]);
        expect(await db.facts(c.f)).toEqual({
          shifts: 1,
          starts: 1,
          ends: action === "END" ? 1 : 0,
          decisions: 1,
        });
      } finally {
        await fresh.app.close();
      }
    },
  );

  for (const action of ["START", "END"] as const) {
    it.each(["REQUIRE", "REQUIRE_OR_OVERRIDE"] as const)(
      `${action} current %s does not retrofit a new effect onto an already-satisfied Shift`,
      async (mode) => {
        const c = await noEvidenceCase(db, action);
        const second = await db.challenge(
          c.f,
          c.auth.context,
          c.shift?.shiftId,
          "7",
        );
        const original = await c.run();
        await db.policy(c.f, mode);
        const identity = {
          authenticatedUserId: c.f.userId,
          sessionContext: c.auth.context,
          operationId: second.operationId,
        };
        const result =
          action === "START"
            ? await createStartShiftCommandExecutor(db.runtimePool)({
                ...identity,
                targetLocationId: c.f.locationId,
              })
            : await createEndShiftCommandExecutor(db.runtimePool)({
                ...identity,
                shiftId: c.shift!.shiftId,
                cashReported: "7",
              });
        expect(result).toEqual(original);
        expect(
          await db.presence.status(c.auth.context, second.operationId),
        ).toMatchObject({ status: "COMMITTED", decisionId: null });
        expect(await db.facts(c.f)).toEqual({
          shifts: 1,
          starts: 1,
          ends: action === "END" ? 1 : 0,
          decisions: 0,
        });
      },
    );
  }

  it("converged Start result survives challenge purge, later End and a replacement active Shift", async () => {
    const c = await noEvidenceCase(db, "START");
    const second = await db.challenge(c.f, c.auth.context);
    const first = await c.run();
    const intent = {
      authenticatedUserId: c.f.userId,
      sessionContext: c.auth.context,
      targetLocationId: c.f.locationId,
      operationId: second.operationId,
    };
    expect(
      await createStartShiftCommandExecutor(db.runtimePool)(intent),
    ).toEqual(first);
    await presenceTransaction(db.adminPool, async (tx) => {
      await tx.query(
        `ALTER TABLE shift_presence_challenges DISABLE TRIGGER USER`,
      );
      await tx.query(
        `UPDATE shift_presence_challenges SET expires_at=clock_timestamp()-interval '25 hours',issued_at=clock_timestamp()-interval '25 hours 300 seconds' WHERE id=$1`,
        [second.challengeId],
      );
      await tx.query(
        `ALTER TABLE shift_presence_challenges ENABLE TRIGGER USER`,
      );
    });
    await db.adminPool.query(`SELECT shift_presence_maintain(1000)`);
    expect(
      (
        await db.adminPool.query(
          `SELECT id FROM shift_presence_challenges WHERE id=$1`,
          [second.challengeId],
        )
      ).rowCount,
    ).toBe(0);
    await db.end(c.f, first.shiftId);
    const later = await db.start(c.f, c.auth.context);
    expect(later.shiftId).not.toBe(first.shiftId);
    const recovered = await db.presence.status(
      c.auth.context,
      second.operationId,
    );
    expect(recovered).toMatchObject({
      status: "COMMITTED",
      result: { shiftId: first.shiftId, status: "ACTIVE", endedAt: null },
    });
    expect(
      await createStartShiftCommandExecutor(db.runtimePool)(intent),
    ).toEqual(first);
  });
});

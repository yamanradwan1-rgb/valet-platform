import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { convergenceSnapshotPool } from "./shift-presence-convergence-test-helper";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import { createEndShiftCommandExecutor } from "../src/modules/shifts/end-shift-command";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-convergence-fences");
let http: Awaited<ReturnType<typeof presenceHttp>>;
beforeAll(async () => {
  await db.setup();
  http = await presenceHttp(db);
}, 120_000);
afterEach(abortPresenceCommitBarriers);
afterAll(async () => {
  await http?.app.close();
  await db.teardown();
}, 60_000);

describe("distinct convergence never changes a different target or cash intent", () => {
  it.each([false, true])(
    "different Location stays conflict, INSERT-loser snapshot=%s",
    async (snapshot) => {
      const c = await noEvidenceCase(db, "START");
      const other = { ...c.f, locationId: await db.addLocation(c.f) };
      const second = await db.challenge(other, c.auth.context);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = c.run(gate.pool);
      await gate.atCommit;
      const probe = convergenceSnapshotPool(db.runtimePool);
      const app = await presenceHttp(
        db,
        snapshot ? probe.pool : db.runtimePool,
      );
      try {
        const loser = app.request(
          "POST",
          "/v1/staff/shifts/start",
          c.auth.token,
          {
            targetLocationId: other.locationId,
            operationId: second.operationId,
          },
        );
        await observePresenceCommandWait(db);
        gate.finish("COMMIT");
        await first;
        const response = await loser;
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: "ACTIVE_SHIFT_CONFLICT" });
        expect(probe.uniqueViolations).toHaveLength(snapshot ? 1 : 0);
        expect(
          await db.presence.status(c.auth.context, second.operationId),
        ).toMatchObject({ state: "PENDING" });
        expect(await db.facts(c.f)).toEqual({
          shifts: 1,
          starts: 1,
          ends: 0,
          decisions: 0,
        });
      } finally {
        await app.app.close();
      }
    },
  );

  it("O2's own different cash intent cannot converge onto O1's stored End", async () => {
    const c = await noEvidenceCase(db, "END");
    const second = await db.challenge(
      c.f,
      c.auth.context,
      c.shift!.shiftId,
      "8",
    );
    const gate = presenceCommitBarrier(db.runtimePool);
    const first = c.run(gate.pool);
    await gate.atCommit;
    const loser = http.request(
      "POST",
      `/v1/staff/shifts/${c.shift!.shiftId}/end`,
      c.auth.token,
      { cashReported: "8", operationId: second.operationId },
    );
    await observePresenceCommandWait(db);
    gate.finish("COMMIT");
    const original = await first;
    const response = await loser;
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "PRESENCE_OPERATION_CONFLICT",
    });
    expect(original.cashReconciliation?.cashReported).toBe("7.000");
    expect(
      await db.presence.status(c.auth.context, second.operationId),
    ).toMatchObject({ state: "PENDING" });
    expect(await db.facts(c.f)).toEqual({
      shifts: 1,
      starts: 1,
      ends: 1,
      decisions: 0,
    });
  });

  it("force-ended/no-cash remains unavailable and does not terminalize O2 as success", async () => {
    const c = await noEvidenceCase(db, "END");
    await db.adminPool.query(
      `UPDATE shifts SET status='ENDED',ended_at=clock_timestamp() WHERE id=$1`,
      [c.shift!.shiftId],
    );
    await expect(c.run()).rejects.toMatchObject({
      code: "SHIFT_CASH_RECONCILIATION_UNAVAILABLE",
    });
    expect(await c.row()).toMatchObject({
      status: "PENDING",
      request_fingerprint: null,
      completion_basis: null,
    });
    expect(await db.facts(c.f)).toEqual({
      shifts: 1,
      starts: 1,
      ends: 0,
      decisions: 0,
    });
  });

  it.each(["START", "END"] as const)(
    "%s no-effect transaction rollback leaves O2 pending, with O1 effect unchanged",
    async (action) => {
      const c = await noEvidenceCase(db, action);
      const second = await db.challenge(
        c.f,
        c.auth.context,
        c.shift?.shiftId,
        "7",
      );
      const original = await c.run();
      const gate = presenceCommitBarrier(db.runtimePool);
      const intent = {
        authenticatedUserId: c.f.userId,
        sessionContext: c.auth.context,
        operationId: second.operationId,
      };
      const loser = (
        action === "START"
          ? createStartShiftCommandExecutor(gate.pool)({
              ...intent,
              targetLocationId: c.f.locationId,
            })
          : createEndShiftCommandExecutor(gate.pool)({
              ...intent,
              shiftId: c.shift!.shiftId,
              cashReported: "7",
            })
      ).catch((error) => error);
      await gate.atCommit;
      const read = db.presence.status(c.auth.context, second.operationId);
      await observePresenceCommandWait(db);
      gate.finish("ROLLBACK");
      const [error, status] = await Promise.all([loser, read]);
      expect(error).toMatchObject({ message: "TEST_ROLLBACK" });
      expect(status).toMatchObject({ state: "PENDING" });
      expect(
        (
          await db.adminPool.query(
            `SELECT request_fingerprint,completion_basis FROM shift_presence_operations WHERE operation_id=$1`,
            [second.operationId],
          )
        ).rows[0],
      ).toEqual({ request_fingerprint: null, completion_basis: null });
      expect(await db.facts(c.f)).toEqual({
        shifts: 1,
        starts: 1,
        ends: action === "END" ? 1 : 0,
        decisions: 0,
      });
      const retry =
        action === "START"
          ? await createStartShiftCommandExecutor(db.runtimePool)({
              ...intent,
              targetLocationId: c.f.locationId,
            })
          : await createEndShiftCommandExecutor(db.runtimePool)({
              ...intent,
              shiftId: c.shift!.shiftId,
              cashReported: "7.000",
            });
      expect(retry).toEqual(original);
    },
  );
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import { presenceHttp } from "./shift-presence-http-test-helper";
import { convergenceSnapshotPool } from "./shift-presence-convergence-test-helper";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";
import { shiftPresenceRecoveryResponseSchema } from "@valet/contracts";

const db = new PresenceServerTestContext("presence-convergence-races");
beforeAll(() => db.setup(), 120_000);
afterEach(abortPresenceCommitBarriers);
afterAll(() => db.teardown(), 60_000);

describe("distinct-operation committed result survives losing acknowledgement", () => {
  it.each([
    ["START", false, "OFF", "NONE"],
    ["START", true, "OFF", "NONE"],
    ["END", false, "OFF", "NONE"],
    ["START", false, "WARN_ONLY", "NONE"],
    ["START", true, "WARN_ONLY", "NONE"],
    ["END", false, "WARN_ONLY", "NONE"],
    ["START", false, "WARN_ONLY", "MEASURED"],
    ["START", true, "WARN_ONLY", "MEASURED"],
    ["END", false, "WARN_ONLY", "MEASURED"],
  ] as const)(
    "%s snapshot=%s, %s/%s",
    async (action, snapshot, mode, evidence) => {
      const c = await noEvidenceCase(db, action, mode);
      const second = await db.challenge(
        c.f,
        c.auth.context,
        c.shift?.shiftId,
        "7.000",
      );
      expect(second.operationId).not.toBe(c.challenge.operationId);
      const gate = presenceCommitBarrier(db.runtimePool);
      const winner = c.run(gate.pool);
      await gate.atCommit;
      const probe = convergenceSnapshotPool(db.runtimePool);
      const old = await presenceHttp(
        db,
        snapshot ? probe.pool : db.runtimePool,
      );
      const path =
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${c.shift!.shiftId}/end`;
      const body = {
        ...(evidence === "MEASURED"
          ? { presence: db.measured(second, 32.1) }
          : {}),
        ...(action === "START"
          ? {
              targetLocationId: c.f.locationId,
              operationId: second.operationId,
            }
          : { cashReported: "7", operationId: second.operationId }),
      };
      const lost = old
        .request("POST", path, c.auth.token, body, "DISCONNECT")
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish("COMMIT");
      const original = await winner;
      expect(await lost).toBeInstanceOf(Error);
      await old.app.close();
      expect(probe.uniqueViolations).toHaveLength(snapshot ? 1 : 0);
      const fresh = await presenceHttp(db);
      try {
        const read = await fresh.request(
          "GET",
          `/v1/staff/shifts/presence/operations/${second.operationId}`,
          c.auth.token,
        );
        expect(read.status).toBe(200);
        const result = shiftPresenceRecoveryResponseSchema.parse(read.body);
        expect(result).toMatchObject({
          state: "RECOVERABLE",
          status: "COMMITTED",
          decisionId: null,
          result: {
            shiftId: original.shiftId,
            status: action === "START" ? "ACTIVE" : "ENDED",
          },
        });
        const terminal = (
          await db.adminPool.query(
            `SELECT status,completion_basis,result_decision_id,result_shift_id FROM shift_presence_operations WHERE operation_id=$1`,
            [second.operationId],
          )
        ).rows[0];
        expect(terminal).toEqual({
          status: "COMMITTED",
          completion_basis: "NO_EFFECT_CONVERGENCE",
          result_decision_id: null,
          result_shift_id: original.shiftId,
        });
        expect(
          (
            await db.adminPool.query(
              `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
              [second.challengeId],
            )
          ).rows[0].consumed_at,
        ).toBeNull();
        expect(await db.facts(c.f)).toEqual({
          shifts: 1,
          starts: 1,
          ends: action === "END" ? 1 : 0,
          decisions: mode === "WARN_ONLY" ? 1 : 0,
        });
        const retry = await fresh.request("POST", path, c.auth.token, body);
        expect(retry.status).toBe(200);
        if (result.state === "RECOVERABLE")
          expect(retry.body).toEqual(result.result);
        const winnerRead = await fresh.request(
          "GET",
          `/v1/staff/shifts/presence/operations/${c.challenge.operationId}`,
          c.auth.token,
        );
        if (result.state === "RECOVERABLE")
          expect(result.result).toEqual(winnerRead.body.result);
      } finally {
        await fresh.app.close();
      }
    },
  );
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { noEvidenceCase } from "./shift-presence-no-evidence-test-helper";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";
import { lockManagementSettingsOrganization } from "../src/common/database/management-settings-lock";
import { presenceTransaction } from "./shift-presence-test-helpers";

const db = new PresenceServerTestContext("presence-no-evidence-races");
beforeAll(async () => {
  await db.setup();
  await db.permitStrictFixtures();
}, 120_000);
afterEach(abortPresenceCommitBarriers);
afterAll(() => db.teardown(), 60_000);

describe("correlated no-evidence real PostgreSQL winner/rollback schedules", () => {
  for (const action of ["START", "END"] as const) {
    it.each(["OFF", "WARN_ONLY"] as const)(
      `${action} %s concurrent identical O returns one effective result`,
      async (mode) => {
        const c = await noEvidenceCase(db, action, mode);
        const gate = presenceCommitBarrier(db.runtimePool);
        const first = c.run(gate.pool);
        await gate.atCommit;
        const second = c.run();
        await observePresenceCommandWait(db);
        gate.finish("COMMIT");
        const results = await Promise.all([first, second]);
        expect(results[0]).toEqual(results[1]);
        expect(await db.facts(c.f)).toEqual({
          shifts: 1,
          starts: 1,
          ends: action === "END" ? 1 : 0,
          decisions: mode === "WARN_ONLY" ? 1 : 0,
        });
        expect(
          (
            await db.adminPool.query(
              `SELECT count(*)::int AS n FROM shift_presence_operations WHERE user_id=$1`,
              [c.f.userId],
            )
          ).rows[0].n,
        ).toBe(1);
      },
    );
    it.each(["COMMIT", "ROLLBACK"] as const)(
      `${action} strict no-evidence denial/status boundary %s`,
      async (outcome) => {
        const c = await noEvidenceCase(db, action);
        await db.policy(c.f, "REQUIRE");
        const gate = presenceCommitBarrier(db.runtimePool);
        const command = c.run(gate.pool).catch((error) => error);
        await gate.atCommit;
        const read = db.presence.status(
          c.auth.context,
          c.challenge.operationId,
        );
        await observePresenceCommandWait(db);
        gate.finish(outcome);
        const [error, status] = await Promise.all([command, read]);
        expect(error).toMatchObject(
          outcome === "COMMIT"
            ? { code: "PRESENCE_REQUIRED" }
            : { message: "TEST_ROLLBACK" },
        );
        expect(status).toMatchObject(
          outcome === "COMMIT"
            ? {
                state: "RECOVERABLE",
                status: "DENIED",
                denialReason: "PRESENCE_REQUIRED",
                summary: null,
                result: null,
                decisionId: null,
              }
            : { state: "PENDING" },
        );
        expect(await c.row()).toMatchObject(
          outcome === "COMMIT"
            ? { status: "DENIED" }
            : {
                status: "PENDING",
                request_fingerprint: null,
                request_policy_fingerprint: null,
              },
        );
        expect(await db.facts(c.f)).toEqual({
          shifts: action === "END" ? 1 : 0,
          starts: action === "END" ? 1 : 0,
          ends: 0,
          decisions: 0,
        });
      },
    );
    it.each([
      ["OFF", "OFF", "COMMIT", "OFF"],
      ["OFF", "WARN_ONLY", "COMMIT", "WARN_ONLY"],
      ["OFF", "REQUIRE", "COMMIT", "REQUIRE"],
      ["WARN_ONLY", "REQUIRE", "COMMIT", "REQUIRE"],
      ["REQUIRE", "OFF", "COMMIT", "OFF"],
      ["OFF", "WARN_ONLY", "ROLLBACK", "OFF"],
      ["OFF", "REQUIRE", "UNKNOWN", "REQUIRE"],
    ] as const)(
      `${action}: issuance %s, writer %s %s, final %s`,
      async (issued, changed, outcome, final) => {
        const c = await noEvidenceCase(db, action, issued);
        expect(c.challenge.presence.mode).toBe(issued);
        const gate = presenceCommitBarrier(db.adminPool);
        const writer = presenceTransaction(gate.pool, async (tx) => {
          await lockManagementSettingsOrganization(
            tx,
            c.f.organizationId,
            "EXCLUSIVE",
          );
          await tx.query(
            `UPDATE organizations SET shift_start_presence_mode=$2,shift_end_presence_mode=$2 WHERE id=$1`,
            [c.f.organizationId, changed],
          );
        }).catch((error) => error);
        await gate.atCommit;
        const command = c.run().catch((error) => error);
        await observePresenceCommandWait(db);
        gate.finish(outcome);
        const [writerResult, result] = await Promise.all([writer, command]);
        if (outcome !== "COMMIT")
          expect(writerResult).toMatchObject({
            message:
              outcome === "ROLLBACK"
                ? "TEST_ROLLBACK"
                : "TEST_COMMIT_OUTCOME_UNKNOWN",
          });
        const strict = final === "REQUIRE";
        if (strict) expect(result).toMatchObject({ code: "PRESENCE_REQUIRED" });
        else
          expect(result.status).toBe(action === "START" ? "ACTIVE" : "ENDED");
        const status = await db.presence.status(
          c.auth.context,
          c.challenge.operationId,
        );
        expect(status).toMatchObject({
          state: "RECOVERABLE",
          status: strict ? "DENIED" : "COMMITTED",
          summary: null,
        });
        if (strict)
          expect(status).toMatchObject({
            denialReason: "PRESENCE_REQUIRED",
            result: null,
            decisionId: null,
          });
        expect(await c.row()).toMatchObject({
          status: strict ? "DENIED" : "COMMITTED",
          completion_basis: final === "OFF" ? "OFF_NO_EVIDENCE" : null,
        });
        const decisions = (
          await db.adminPool.query(
            `SELECT applied_mode,operation_id FROM shift_presence_decisions WHERE user_id=$1`,
            [c.f.userId],
          )
        ).rows;
        expect(decisions).toEqual(
          final === "WARN_ONLY"
            ? [
                {
                  applied_mode: "WARN_ONLY",
                  operation_id: c.challenge.operationId,
                },
              ]
            : [],
        );
        expect(await db.facts(c.f)).toEqual({
          shifts: action === "END" || !strict ? 1 : 0,
          decisions: final === "WARN_ONLY" ? 1 : 0,
          starts: action === "END" || !strict ? 1 : 0,
          ends: action === "END" && !strict ? 1 : 0,
        });
      },
    );

    for (const mode of ["OFF", "WARN_ONLY"] as const) {
      it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
        `${action} ${mode}: command/status commit boundary %s`,
        async (outcome) => {
          const c = await noEvidenceCase(db, action, mode);
          const gate = presenceCommitBarrier(db.runtimePool);
          const command = c.run(gate.pool).catch((error) => error);
          await gate.atCommit;
          const read = db.presence.status(
            c.auth.context,
            c.challenge.operationId,
          );
          await observePresenceCommandWait(db);
          gate.finish(outcome);
          const [result, status] = await Promise.all([command, read]);
          if (outcome !== "COMMIT")
            expect(result).toMatchObject({
              message:
                outcome === "ROLLBACK"
                  ? "TEST_ROLLBACK"
                  : "TEST_COMMIT_OUTCOME_UNKNOWN",
            });
          const committed = outcome !== "ROLLBACK";
          expect(status).toMatchObject(
            committed
              ? { state: "RECOVERABLE", status: "COMMITTED" }
              : { state: "PENDING" },
          );
          expect(await c.row()).toMatchObject(
            committed
              ? { status: "COMMITTED" }
              : {
                  status: "PENDING",
                  request_fingerprint: null,
                  request_policy_fingerprint: null,
                  completion_basis: null,
                  result_shift_id: null,
                  result_decision_id: null,
                },
          );
          expect(await db.facts(c.f)).toEqual({
            shifts: action === "END" || committed ? 1 : 0,
            decisions: mode === "WARN_ONLY" && committed ? 1 : 0,
            starts: action === "END" || committed ? 1 : 0,
            ends: action === "END" && committed ? 1 : 0,
          });
          const consumed = (
            await db.adminPool.query(
              `SELECT consumed_at FROM shift_presence_challenges WHERE id=$1`,
              [c.challenge.challengeId],
            )
          ).rows[0].consumed_at;
          expect(consumed !== null).toBe(mode === "WARN_ONLY" && committed);
        },
      );
    }
  }
});

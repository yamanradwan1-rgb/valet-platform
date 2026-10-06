import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { ShiftPresenceService } from "../src/modules/shifts/shift-presence.service";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  abortPresenceCommitBarriers,
  observePresenceCommandWait,
  presenceCommitBarrier,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-consumer-policy-races");
beforeAll(async () => {
  await db.setup();
}, 120_000);
afterEach(abortPresenceCommitBarriers);
afterAll(() => db.teardown(), 60_000);

describe("real settings and exact denial commit boundaries", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "challenge versus policy writer, issuance %s",
    async (outcome) => {
      const f = await db.createFixture();
      await db.policy(f, "REQUIRE", "OFF");
      await db.zone(f);
      const auth = await db.session(f.userId);
      const manager = await db.manager(f);
      const operationId = randomUUID();
      const gate = presenceCommitBarrier(db.runtimePool);
      const issuance = new ShiftPresenceService(gate.pool)
        .issue(auth.context, {
          action: "START",
          targetLocationId: f.locationId,
          operationId,
        })
        .catch((error) => error);
      await gate.atCommit;
      const changed = db.management.setCompany(
        manager.context,
        manager.companyTarget,
        {
          expectedRevision: 2,
          mutationId: randomUUID(),
          field: "shiftStartPresenceMode",
          value: "WARN_ONLY",
        },
      );
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      const [issued, policy] = await Promise.all([issuance, changed]);
      expect(policy.policy.startMode).toBe("WARN_ONLY");
      if (outcome === "ROLLBACK") {
        expect(issued).toMatchObject({ message: "TEST_ROLLBACK" });
        expect(await db.presence.status(auth.context, operationId)).toEqual({
          operationId,
          state: "EXPIRED",
        });
        expect(
          (
            await db.adminPool.query(
              `SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1`,
              [f.userId],
            )
          ).rows[0].count,
        ).toBe(0);
        return;
      }
      if (outcome === "UNKNOWN")
        expect(issued).toMatchObject({
          message: "TEST_COMMIT_OUTCOME_UNKNOWN",
        });
      else expect(issued.presence.mode).toBe("REQUIRE");
      const current = await db.presence.challenge(auth.context, operationId);
      expect(current.presence.mode).toBe("WARN_ONLY");
      const committed = await db.start(
        f,
        auth.context,
        db.measured(current, 32.1),
      );
      expect(committed.status).toBe("ACTIVE");
      expect(
        (
          await db.adminPool.query(
            `SELECT applied_mode,classification FROM shift_presence_decisions WHERE operation_id=$1`,
            [operationId],
          )
        ).rows[0],
      ).toEqual({
        applied_mode: "WARN_ONLY",
        classification: "CONFIDENT_OUTSIDE",
      });
      expect(await db.facts(f)).toEqual({
        shifts: 1,
        decisions: 1,
        starts: 1,
        ends: 0,
      });
    },
  );
  it.each(["COMMIT", "ROLLBACK"] as const)(
    "denial versus status read, protected transaction %s",
    async (outcome) => {
      const f = await db.createFixture();
      await db.policy(f, "REQUIRE");
      await db.zone(f);
      const auth = await db.session(f.userId);
      const challenge = await db.challenge(f, auth.context);
      const gate = presenceCommitBarrier(db.runtimePool);
      const rejected = createStartShiftCommandExecutor(gate.pool)({
        authenticatedUserId: f.userId,
        targetLocationId: f.locationId,
        sessionContext: auth.context,
        presence: db.measured(challenge, 32.1),
      }).catch((error) => error);
      await gate.atCommit;
      const read = db.presence.status(auth.context, challenge.operationId);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      const [failure, status] = await Promise.all([rejected, read]);
      if (outcome === "ROLLBACK") {
        expect(failure).toMatchObject({ message: "TEST_ROLLBACK" });
        expect(status).toEqual({
          state: "PENDING",
          operationId: challenge.operationId,
          exceptionId: null,
        });
      } else {
        expect(failure).toMatchObject({ code: "PRESENCE_REJECTED" });
        expect(status).toMatchObject({
          status: "DENIED",
          summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
        });
      }
      expect(await db.facts(f)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1`,
            [f.userId],
          )
        ).rows[0].count,
      ).toBe(1);
    },
  );
});

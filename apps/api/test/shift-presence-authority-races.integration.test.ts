import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StaffManagementMutationService } from "../src/modules/management/staff-management-mutation.service";
import { PresenceManagementService } from "../src/modules/management/presence-management.service";
import { PresenceServerTestContext } from "./shift-presence-server-test-context";
import { pendingPresenceException } from "./shift-presence-exception-test-helper";
import {
  presenceCommitBarrier,
  observePresenceCommandWait,
  mutationAuditCount,
  abortPresenceCommitBarriers,
} from "./shift-presence-commit-test-helper";

const db = new PresenceServerTestContext("presence-authority-races");
beforeAll(async () => {
  await db.setup();
}, 120_000);
afterAll(() => db.teardown(), 60_000);
afterEach(() => abortPresenceCommitBarriers());

describe("R07/R09/R11 actual staff invalidators compose with protected presence commands", () => {
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R07 approval vs rejection, first %s",
    async (outcome) => {
      const a = await pendingPresenceException(db);
      const gate = presenceCommitBarrier(db.runtimePool);
      const mutationId = randomUUID();
      const first = new PresenceManagementService(gate.pool)
        .review(
          a.manager.context,
          a.manager.target,
          String(a.exception.exceptionId),
          { expectedRevision: 1, mutationId },
          "APPROVED",
        )
        .catch((error) => error);
      await gate.atCommit;
      const second = db.management
        .review(
          a.manager.context,
          a.manager.target,
          String(a.exception.exceptionId),
          { expectedRevision: 1, mutationId: randomUUID() },
          "REJECTED",
        )
        .catch((error) => error);
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      const loser = await second;
      if (outcome === "ROLLBACK")
        expect(loser).toMatchObject({ status: "REJECTED", revision: 2 });
      else expect(loser).toMatchObject({ code: "PRESENCE_REVIEW_CONFLICT" });
      expect(
        (
          await db.presence.exception(
            a.requester.context,
            String(a.exception.exceptionId),
          )
        ).status,
      ).toBe(outcome === "ROLLBACK" ? "REJECTED" : "APPROVED");
      expect(
        await mutationAuditCount(
          db,
          a.fixture.organizationId,
          "SHIFT_PRESENCE_EXCEPTION_APPROVED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
      expect(
        await mutationAuditCount(
          db,
          a.fixture.organizationId,
          "SHIFT_PRESENCE_EXCEPTION_REJECTED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 1 : 0);
      expect(
        await db.management.result(
          a.manager.context,
          a.manager.target,
          mutationId,
          { kind: "EXCEPTION", entityId: String(a.exception.exceptionId) },
        ),
      ).toMatchObject({
        attribution: outcome === "ROLLBACK" ? "UNKNOWN" : "COMMITTED",
      });
      expect(await db.facts(a.fixture)).toEqual({
        shifts: 0,
        decisions: 0,
        starts: 0,
        ends: 0,
      });
    },
  );
  it.each(["COMMIT", "ROLLBACK", "UNKNOWN"] as const)(
    "R09 requester grant invalidation while review is pending, first %s",
    async (outcome) => {
      const a = await pendingPresenceException(db);
      const invalidator = await db.manager(a.fixture);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new StaffManagementMutationService(gate.pool)
        .locationAccess(
          invalidator.context,
          a.fixture.organizationId,
          a.fixture.membershipId,
          { expectedVersion: 1, locationIds: [a.fixture.locationId] },
          false,
        )
        .catch((error) => error);
      await gate.atCommit;
      await expect(a.approve()).rejects.toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
      });
      gate.finish(outcome);
      await first;
      if (outcome === "ROLLBACK")
        expect(await a.approve()).toMatchObject({ status: "APPROVED" });
      else
        await expect(a.approve()).rejects.toMatchObject({
          code: "AUTHORIZATION_DENIED",
        });
      expect(
        (
          await db.adminPool.query(
            `SELECT status,revision FROM shift_presence_exceptions WHERE id=$1`,
            [a.exception.exceptionId],
          )
        ).rows[0],
      ).toEqual({
        status: outcome === "ROLLBACK" ? "APPROVED" : "PENDING",
        revision: outcome === "ROLLBACK" ? 2 : 1,
      });
      expect(
        await mutationAuditCount(
          db,
          a.fixture.organizationId,
          "SHIFT_PRESENCE_EXCEPTION_APPROVED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 1 : 0);
    },
  );
  it.each(
    (["START", "END"] as const).flatMap((action) =>
      (["COMMIT", "ROLLBACK", "UNKNOWN"] as const).map((outcome) => ({
        action,
        outcome,
      })),
    ),
  )(
    "R11 original LM revoke wins before $action consumption, first $outcome",
    async ({ action, outcome }) => {
      const a = await pendingPresenceException(db, action, "LOCATION_MANAGER");
      await a.approve();
      const invalidator = await db.manager(a.fixture);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = new StaffManagementMutationService(gate.pool)
        .locationAccess(
          invalidator.context,
          a.fixture.organizationId,
          a.manager.membershipId,
          { expectedVersion: 1, locationIds: [a.fixture.locationId] },
          false,
        )
        .catch((error) => error);
      await gate.atCommit;
      await expect(a.consume()).rejects.toMatchObject({
        code: "PRESENCE_AUTHORITY_BUSY",
      });
      expect(
        (
          await db.adminPool.query(
            `SELECT status FROM shift_presence_exceptions WHERE id=$1`,
            [a.exception.exceptionId],
          )
        ).rows[0].status,
      ).toBe("APPROVED");
      gate.finish(outcome);
      await first;
      if (outcome === "ROLLBACK")
        expect((await a.consume()).status).toBe(
          action === "END" ? "ENDED" : "ACTIVE",
        );
      else
        await expect(a.consume()).rejects.toMatchObject({
          code: "APPROVER_AUTHORITY_REVOKED",
        });
      expect(await db.facts(a.fixture)).toEqual({
        shifts: action === "END" || outcome === "ROLLBACK" ? 1 : 0,
        decisions: outcome === "ROLLBACK" ? 1 : 0,
        starts: action === "END" || outcome === "ROLLBACK" ? 1 : 0,
        ends: action === "END" && outcome === "ROLLBACK" ? 1 : 0,
      });
      expect(
        await mutationAuditCount(
          db,
          a.fixture.organizationId,
          "SHIFT_PRESENCE_APPROVAL_EXPIRED",
        ),
      ).toBe(outcome === "ROLLBACK" ? 0 : 1);
    },
  );
  it.each(
    (["START", "END"] as const).flatMap((action) =>
      (["COMMIT", "ROLLBACK", "UNKNOWN"] as const).map((outcome) => ({
        action,
        outcome,
      })),
    ),
  )(
    "R11 $action consumption wins the authority interval, first $outcome",
    async ({ action, outcome }) => {
      const a = await pendingPresenceException(db, action, "LOCATION_MANAGER");
      await a.approve();
      const invalidator = await db.manager(a.fixture);
      const gate = presenceCommitBarrier(db.runtimePool);
      const first = a.consume(gate.pool).catch((error) => error);
      await gate.atCommit;
      const revoke = new StaffManagementMutationService(
        db.runtimePool,
      ).locationAccess(
        invalidator.context,
        a.fixture.organizationId,
        a.manager.membershipId,
        { expectedVersion: 1, locationIds: [a.fixture.locationId] },
        false,
      );
      await observePresenceCommandWait(db);
      gate.finish(outcome);
      await first;
      await revoke;
      if (outcome === "ROLLBACK") {
        expect(
          await db.presence.status(
            a.requester.context,
            a.challenge.operationId,
          ),
        ).toMatchObject({ state: "PENDING" });
        expect(
          (
            await db.presence.exception(
              a.requester.context,
              String(a.exception.exceptionId),
            )
          ).status,
        ).toBe("APPROVED");
      } else {
        expect(
          await db.presence.status(
            a.requester.context,
            a.challenge.operationId,
          ),
        ).toMatchObject({ state: "RECOVERABLE", status: "COMMITTED" });
        expect(
          (
            await db.presence.exception(
              a.requester.context,
              String(a.exception.exceptionId),
            )
          ).status,
        ).toBe("CONSUMED");
      }
      expect(await db.facts(a.fixture)).toEqual({
        shifts: action === "END" || outcome !== "ROLLBACK" ? 1 : 0,
        decisions: outcome === "ROLLBACK" ? 0 : 1,
        starts: action === "END" || outcome !== "ROLLBACK" ? 1 : 0,
        ends: action === "END" && outcome !== "ROLLBACK" ? 1 : 0,
      });
      expect(
        await mutationAuditCount(
          db,
          a.fixture.organizationId,
          "SHIFT_PRESENCE_APPROVAL_EXPIRED",
        ),
      ).toBe(0);
    },
  );
});

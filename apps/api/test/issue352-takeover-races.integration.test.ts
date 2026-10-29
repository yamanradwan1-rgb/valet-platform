import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import { readEmergencyTakeoverContext } from "../src/modules/dispatch/emergency-task-takeover.detail-query";
import {
  holdTakeoverCommit,
  waitForIssue352DatabaseLock,
} from "./issue352-takeover-race-fixture";
import {
  Issue352TakeoverTestContext,
  takeoverTaskId,
} from "./issue352-takeover-test-context";

const context = new Issue352TakeoverTestContext("races");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

const execute = () => createEmergencyTakeoverCommandExecutor(context.runtimePool);

describe("Issue #352 real PostgreSQL commit, replay and lock races", () => {
  it("allows one winner for concurrent A→B and A→C at the same version", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const rival = await context.addMember(source);
    const request = await context.request(source, initiator, replacement);
    const firstGate = holdTakeoverCommit(context.runtimePool);
    const first = createEmergencyTakeoverCommandExecutor(firstGate.pool)(request);
    try {
      await firstGate.held;
      const rivalAttempt = execute()({ ...request, operationId: randomUUID(),
        targetAssigneeMembershipId: rival.membershipId });
      await waitForIssue352DatabaseLock(context);
      firstGate.release();
      const winner = await first;
      await expect(rivalAttempt).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect((await context.snapshot(source.taskId)).task_assignee)
        .toBe(winner.task.assigneeMembershipId);
      const receiptCount = await context.adminPool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM emergency_task_takeover_operations
         WHERE task_id = $1`, [source.taskId],
      );
      expect(receiptCount.rows[0]?.count).toBe(1);
    } finally {
      firstGate.release();
    }
  });

  it("reconciles simultaneous duplicate operation UUID requests once", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const gate = holdTakeoverCommit(context.runtimePool);
    const first = createEmergencyTakeoverCommandExecutor(gate.pool)(request);
    try {
      await gate.held;
      const duplicate = execute()(request);
      await waitForIssue352DatabaseLock(context);
      gate.release();
      const committed = await first;
      expect(await duplicate).toEqual({ ...committed, replayed: true });
      const snapshot = await context.snapshot(source.taskId);
      expect(snapshot.task_version).toBe(committed.task.version);
    } finally {
      gate.release();
    }
  });

  it("rolls back Task, Session, receipt, audit, tracking and proofs on pre-COMMIT failure", async () => {
    const source = await context.verifiedHandoff();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const before = await context.snapshot(takeoverTaskId(source));
    const proof = await context.handoffHistory(source.sessionId);
    const gate = holdTakeoverCommit(context.runtimePool, "rollback");
    const pending = createEmergencyTakeoverCommandExecutor(gate.pool)(request);
    try {
      await gate.held;
      gate.release();
      await expect(pending).rejects.toThrow("pre-COMMIT failure");
      expect(await context.snapshot(takeoverTaskId(source))).toEqual(before);
      expect(await context.handoffHistory(source.sessionId)).toEqual(proof);
      const receipts = await context.adminPool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM emergency_task_takeover_operations
         WHERE operation_id = $1`, [request.operationId],
      );
      expect(receipts.rows[0]?.count).toBe(0);
      expect((await execute()(request)).replayed).toBe(false);
    } finally {
      gate.release();
    }
  });

  it("recovers a lost HTTP response after committed success via the same UUID", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const gate = holdTakeoverCommit(context.runtimePool, "lost-response");
    const pending = createEmergencyTakeoverCommandExecutor(gate.pool)(request);
    try {
      await gate.held;
      gate.release();
      await expect(pending).rejects.toThrow("lost response after COMMIT");
      const committed = await context.snapshot(source.taskId);
      expect(committed.task_assignee).toBe(replacement.membershipId);
      const retried = await execute()(request);
      expect(retried).toMatchObject({ operationId: request.operationId, replayed: true });
      expect(await context.snapshot(source.taskId)).toEqual(committed);
    } finally {
      gate.release();
    }
  });

  it("serializes an in-flight GET behind POST takeover without deadlock", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const gate = holdTakeoverCommit(context.runtimePool);
    const post = createEmergencyTakeoverCommandExecutor(gate.pool)(request);
    try {
      await gate.held;
      const get = readEmergencyTakeoverContext(context.runtimePool, {
        taskId: source.taskId, staffSessionContext: request.staffSessionContext,
      });
      await waitForIssue352DatabaseLock(context);
      gate.release();
      await expect(post).resolves.toMatchObject({ replayed: false });
      const detail = await get;
      expect(detail.task.assigneeMembershipId).toBe(replacement.membershipId);
      expect(detail.task.status).toBe("IN_PROGRESS");
    } finally {
      gate.release();
    }
  });

  it("serializes POST takeover behind an in-flight GET without SQLSTATE 40P01", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const gate = holdTakeoverCommit(context.runtimePool);
    const get = readEmergencyTakeoverContext(gate.pool, {
      taskId: source.taskId, staffSessionContext: request.staffSessionContext,
    });
    try {
      await gate.held;
      const post = execute()(request);
      await waitForIssue352DatabaseLock(context);
      gate.release();
      expect((await get).task.assigneeMembershipId).toBe(source.membershipId);
      expect((await post).task.assigneeMembershipId).toBe(replacement.membershipId);
    } finally {
      gate.release();
    }
  });

  it("denies a POST when a previously locked Staff session is revoked first", async () => {
    const source = await context.parking();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const before = await context.snapshot(source.taskId);
    const blocker = await context.adminPool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT id FROM staff_auth_sessions WHERE id = $1 FOR UPDATE`,
        [request.staffSessionContext.staffAuthSessionId],
      );
      const pending = execute()(request);
      await waitForIssue352DatabaseLock(context);
      await blocker.query(
        `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp()
         WHERE id = $1`, [request.staffSessionContext.staffAuthSessionId],
      );
      await blocker.query("COMMIT");
      await expect(pending).rejects.toMatchObject({ status: 401 });
      expect(await context.snapshot(source.taskId)).toEqual(before);
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
  });

  it("blocks A's concurrent final vehicle release until takeover commits", async () => {
    const source = await context.verifiedHandoff();
    const { initiator, replacement } = await context.actors(source);
    const request = await context.request(source, initiator, replacement);
    const before = await context.snapshot(takeoverTaskId(source));
    const gate = holdTakeoverCommit(context.runtimePool);
    const pending = createEmergencyTakeoverCommandExecutor(gate.pool)(request);
    try {
      await gate.held;
      const release = context.complete(source, source.userId, before.session_version);
      await waitForIssue352DatabaseLock(context);
      gate.release();
      await pending;
      await expect(release).rejects.toBeDefined();
      expect((await context.snapshot(takeoverTaskId(source))).session_state)
        .toBe("HANDOFF_PENDING");
      const history = await context.handoffHistory(source.sessionId);
      expect(history.every((proof) => proof.consumed_at !== null)).toBe(true);
    } finally {
      gate.release();
    }
  });
});

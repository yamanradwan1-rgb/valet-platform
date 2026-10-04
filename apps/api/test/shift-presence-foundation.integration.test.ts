import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ShiftPresenceDecision, ShiftPresenceOperation } from "@valet/contracts";

import { allocatePresenceChallenge } from "../src/modules/shifts/shift-presence-challenge";
import { bindPresenceAttempt, completePresenceOperation, readPresenceRecovery } from "../src/modules/shifts/shift-presence-operation";
import { consumePresenceChallenge } from "../src/modules/shifts/shift-presence-decision";
import { lockShiftPresenceConfiguration } from "../src/modules/shifts/shift-presence-policy";
import { createPresenceZone, updatePresenceZone } from "../src/modules/shifts/shift-presence-zone";
import { lockManagementSettingsOrganization } from "../src/common/database/management-settings-lock";
import { ShiftTestContext } from "./shift-test-context";
import { observePresenceLock, presenceTransaction, waitForPresenceLock } from "./shift-presence-test-helpers";

const context = new ShiftTestContext("presence-foundation");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function operation(): Promise<ShiftPresenceOperation> {
  return { ...await context.createFixture(), operationId: randomUUID(), action: "START", shiftId: null,
    targetFingerprint: "a".repeat(64) };
}
function decision(op: ShiftPresenceOperation, challengeId: string): ShiftPresenceDecision {
  return { organizationId: op.organizationId, locationId: op.locationId, userId: op.userId,
    membershipId: op.membershipId, action: op.action, shiftId: op.shiftId, operationId: op.operationId,
    challengeId, policyFingerprint: "c".repeat(64),
    appliedMode: "OFF", companyPolicyRevision: 1, locationPolicyRevision: 1,
    zoneId: null, zoneRevision: null, classification: "CONFIDENT_INSIDE", reason: "INSIDE",
    accuracyBand: "ACCEPTABLE", freshnessBand: "ACCEPTABLE", exceptionId: null };
}

describe("real PostgreSQL foundation races, synthetic evidence only", () => {
  it("composes the result with a separately bound attempt digest and no digest in Decision", async () => {
    const fixture = await context.createFixture();
    const op: ShiftPresenceOperation = { ...fixture, operationId: randomUUID(), action: "START", shiftId: null,
      targetFingerprint: "a".repeat(64) };
    const shiftId = randomUUID();
    await context.adminPool.query(`INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
      VALUES ($1,$2,$3,$4,'ACTIVE',now())`, [shiftId, fixture.organizationId, fixture.locationId, fixture.membershipId]);
    await presenceTransaction(context.runtimePool, async (tx) => {
      const challenge = await allocatePresenceChallenge(tx, op);
      const fact = { ...decision(op, challenge.id), shiftId };
      const id = await consumePresenceChallenge(tx, op, fact, "b".repeat(64));
      await completePresenceOperation(tx, op, { status: "COMMITTED", shiftId, decisionId: id });
      expect(await readPresenceRecovery(tx, op, "b".repeat(64))).toEqual({ state: "RECOVERABLE",
        status: "COMMITTED", shiftId, decisionId: id });
      expect((await tx.query(`SELECT * FROM shift_presence_decisions WHERE id=$1`, [id])).rows[0])
        .not.toHaveProperty("request_fingerprint");
    });
    await expect(presenceTransaction(context.runtimePool, (tx) => readPresenceRecovery(tx, op, "d".repeat(64))))
      .rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
  });
  it("checks exact challenge identity before binding any attempted fingerprint", async () => {
    const op = await operation();
    const foreign = await operation();
    await presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, op));
    const foreignChallenge = await presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, foreign));
    await presenceTransaction(context.runtimePool, async (tx) => {
      await expect(consumePresenceChallenge(tx, op, decision(op, foreignChallenge.id), "b".repeat(64))).rejects.toMatchObject({ code: "PRESENCE_SCOPE_MISMATCH" });
      expect((await tx.query(`SELECT request_fingerprint FROM shift_presence_operations WHERE user_id=$1`, [op.userId])).rows[0].request_fingerprint).toBeNull();
    });
    expect((await context.adminPool.query(`SELECT count(*)::int AS count FROM shift_presence_decisions WHERE user_id=$1`, [op.userId])).rows[0].count).toBe(0);
  });
  it.each(["COMMIT", "ROLLBACK"] as const)("same operation allocation while first transaction %s", async (finish) => {
    const op = await operation();
    const first = await context.runtimePool.connect();
    const second = await context.runtimePool.connect();
    try {
      await first.query("BEGIN"); await second.query("BEGIN");
      const pid = await waitForPresenceLock(context.adminPool, second);
      const initial = await allocatePresenceChallenge(first, op);
      const waiting = allocatePresenceChallenge(second, op);
      await observePresenceLock(context.adminPool, pid);
      await first.query(finish);
      const winner = await waiting;
      await second.query("COMMIT");
      expect(winner.id === initial.id).toBe(finish === "COMMIT");
      expect((await context.adminPool.query(`SELECT count(*)::int AS count FROM shift_presence_operations WHERE user_id=$1 AND operation_id=$2`, [op.userId, op.operationId])).rows[0].count).toBe(1);
      expect((await context.adminPool.query(`SELECT count(*)::int AS count FROM shift_presence_challenges WHERE user_id=$1`, [op.userId])).rows[0].count).toBe(1);
    } finally { await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release(); }
  });
  it.each(["COMMIT", "ROLLBACK"] as const)("changed intent under the same identity while first transaction %s", async (finish) => {
    const op = await operation();
    const first = await context.runtimePool.connect();
    const second = await context.runtimePool.connect();
    try {
      await first.query("BEGIN"); await second.query("BEGIN");
      const pid = await waitForPresenceLock(context.adminPool, second);
      await allocatePresenceChallenge(first, op);
      const waiting = allocatePresenceChallenge(second, { ...op, targetFingerprint: "d".repeat(64) }).catch((e: unknown) => e);
      await observePresenceLock(context.adminPool, pid);
      await first.query(finish);
      if (finish === "COMMIT") {
        expect(await waiting).toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
        await second.query("ROLLBACK");
      } else {
        expect(await waiting).toHaveProperty("id");
        await second.query("COMMIT");
      }
      expect((await context.adminPool.query(`SELECT target_fingerprint FROM shift_presence_operations WHERE user_id=$1`, [op.userId])).rows[0].target_fingerprint).toBe(finish === "COMMIT" ? op.targetFingerprint : "d".repeat(64));
    } finally { await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release(); }
  });
  it.each(["COMMIT", "ROLLBACK"] as const)("conflicting final fingerprints while first transaction %s", async (finish) => {
    const op = await operation();
    await presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, op));
    const first = await context.runtimePool.connect();
    const second = await context.runtimePool.connect();
    try {
      await first.query("BEGIN"); await second.query("BEGIN");
      const pid = await waitForPresenceLock(context.adminPool, second);
      await bindPresenceAttempt(first, op, "b".repeat(64));
      const waiting = bindPresenceAttempt(second, op, "d".repeat(64)).catch((error: unknown) => error);
      await observePresenceLock(context.adminPool, pid);
      await first.query(finish);
      if (finish === "COMMIT") {
        expect(await waiting).toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
        await second.query("ROLLBACK");
      } else {
        expect(await waiting).toMatchObject({ request_fingerprint: "d".repeat(64) });
        await second.query("COMMIT");
      }
      expect((await context.adminPool.query(`SELECT request_fingerprint FROM shift_presence_operations WHERE user_id=$1`, [op.userId])).rows[0].request_fingerprint).toBe((finish === "COMMIT" ? "b" : "d").repeat(64));
    } finally { await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release(); }
  });
  it("binds final evidence once and conflicts on changed evidence", async () => {
    const op = await operation();
    await presenceTransaction(context.runtimePool, async (tx) => {
      await allocatePresenceChallenge(tx, op);
      await bindPresenceAttempt(tx, op, "b".repeat(64));
    });
    await expect(presenceTransaction(context.runtimePool, (tx) => bindPresenceAttempt(tx, op, "d".repeat(64)))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    expect((await context.adminPool.query(`SELECT request_fingerprint FROM shift_presence_operations WHERE user_id=$1`, [op.userId])).rows[0].request_fingerprint).toBe("b".repeat(64));
  });
  it.each(["COMMIT", "ROLLBACK"] as const)("single challenge consumption while first transaction %s", async (finish) => {
    const op = await operation();
    const challenge = await presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, op));
    const first = await context.runtimePool.connect();
    const second = await context.runtimePool.connect();
    try {
      await first.query("BEGIN"); await second.query("BEGIN");
      const pid = await waitForPresenceLock(context.adminPool, second);
      const initial = await consumePresenceChallenge(first, op, decision(op, challenge.id), "b".repeat(64));
      const waiting = consumePresenceChallenge(second, op, decision(op, challenge.id), "b".repeat(64)).catch((e: unknown) => e);
      await observePresenceLock(context.adminPool, pid);
      await first.query(finish);
      const result = await waiting;
      if (finish === "COMMIT") {
        expect(result).toMatchObject({ code: "PRESENCE_CHALLENGE_CONSUMED" });
        await second.query("ROLLBACK");
      } else { expect(typeof result).toBe("string"); expect(result).not.toBe(initial); await second.query("COMMIT"); }
      const persisted = await context.adminPool.query(`SELECT c.decision_id,(SELECT count(*)::int FROM shift_presence_decisions WHERE challenge_id=c.id) AS count FROM shift_presence_challenges c WHERE c.id=$1`, [challenge.id]);
      expect(persisted.rows[0].count).toBe(1);
      expect(persisted.rows[0].decision_id).toBe(finish === "COMMIT" ? initial : result);
    } finally { await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release(); }
  });
  it.each(["COMMIT", "ROLLBACK"] as const)("zone CAS while first writer %s", async (finish) => {
    const op = await operation();
    const zone = { id: randomUUID(), organizationId: op.organizationId, locationId: op.locationId,
      code: "GATE", label: "Initial", latitude: 0, longitude: 0, radiusMeters: 100, state: "ACTIVE" as const, revision: 1 };
    await presenceTransaction(context.runtimePool, (tx) => createPresenceZone(tx, zone));
    const first = await context.runtimePool.connect();
    const second = await context.runtimePool.connect();
    try {
      await first.query("BEGIN"); await second.query("BEGIN");
      const pid = await waitForPresenceLock(context.adminPool, second);
      await updatePresenceZone(first, { ...zone, label: "First" });
      const waiting = updatePresenceZone(second, { ...zone, label: "Second" }).catch((e: unknown) => e);
      await observePresenceLock(context.adminPool, pid);
      await first.query(finish);
      const result = await waiting;
      if (finish === "COMMIT") { expect(result).toMatchObject({ code: "PRESENCE_CAS_CONFLICT" }); await second.query("ROLLBACK"); }
      else { expect(result).toBe(2); await second.query("COMMIT"); }
      expect((await context.adminPool.query(`SELECT label,revision FROM shift_presence_zones WHERE id=$1`, [zone.id])).rows[0]).toEqual({ label: finish === "COMMIT" ? "First" : "Second", revision: 2 });
    } finally { await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release(); }
  });
  it.each(["COMMIT", "ROLLBACK"] as const)("policy revision CAS while first writer %s", async (finish) => {
    const op = await operation();
    const initial = await presenceTransaction(context.runtimePool, (tx) => lockShiftPresenceConfiguration(tx, op));
    const first = await context.adminPool.connect();
    const second = await context.adminPool.connect();
    try {
      await first.query("BEGIN"); await second.query("BEGIN");
      const pid = await waitForPresenceLock(context.adminPool, second);
      await lockManagementSettingsOrganization(first, op.organizationId, "EXCLUSIVE");
      await first.query(`UPDATE organizations SET shift_presence_max_accuracy_meters=25 WHERE id=$1 AND shift_presence_revision=1`, [op.organizationId]);
      const waiting = (async () => {
        await lockManagementSettingsOrganization(second, op.organizationId, "EXCLUSIVE");
        return second.query(`UPDATE organizations SET shift_presence_max_accuracy_meters=40 WHERE id=$1 AND shift_presence_revision=1 RETURNING id`, [op.organizationId]);
      })();
      await observePresenceLock(context.adminPool, pid);
      await first.query(finish);
      expect((await waiting).rowCount).toBe(finish === "COMMIT" ? 0 : 1);
      await second.query("COMMIT");
      const after = await presenceTransaction(context.runtimePool, (tx) => lockShiftPresenceConfiguration(tx, op));
      expect(after.companyRevision).toBe(2);
      expect(after.fingerprint).not.toBe(initial.fingerprint);
      expect(after.policy.maxAccuracyMeters).toBe(finish === "COMMIT" ? 25 : 40);
      expect(after.policy.startMode).toBe("OFF");
    } finally { await first.query("ROLLBACK"); await second.query("ROLLBACK"); first.release(); second.release(); }
  });
});

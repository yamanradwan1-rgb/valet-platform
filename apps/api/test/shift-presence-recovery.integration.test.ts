import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ShiftPresenceOperation, ShiftPresenceScope } from "@valet/contracts";

import { allocatePresenceChallenge } from "../src/modules/shifts/shift-presence-challenge";
import { bindPresenceAttempt, completePresenceOperation, readPresenceOperationStatus, readPresenceRecovery } from "../src/modules/shifts/shift-presence-operation";
import { requestPresenceException } from "../src/modules/shifts/shift-presence-exception";
import { lockShiftPresenceConfiguration } from "../src/modules/shifts/shift-presence-policy";
import { ShiftTestContext } from "./shift-test-context";
import { presenceTransaction } from "./shift-presence-test-helpers";

const context = new ShiftTestContext("presence-recovery");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);
const fingerprint = "b".repeat(64);
async function operation(): Promise<ShiftPresenceOperation> {
  return { ...await context.createFixture(), action: "START", shiftId: null,
    operationId: randomUUID(), targetFingerprint: "a".repeat(64) };
}
function scope(op: ShiftPresenceOperation): ShiftPresenceScope {
  return { organizationId: op.organizationId, locationId: op.locationId,
    userId: op.userId, membershipId: op.membershipId };
}
async function backdateTerminal(op: ShiftPresenceOperation, age: string) {
  await presenceTransaction(context.adminPool, async (tx) => {
    await tx.query(`ALTER TABLE shift_presence_operations DISABLE TRIGGER USER`);
    await tx.query(`WITH t AS MATERIALIZED (SELECT clock_timestamp()-$3::interval AS at)
      UPDATE shift_presence_operations SET created_at=t.at-interval '301 seconds',
        expires_at=t.at-interval '1 second',terminal_at=t.at FROM t WHERE user_id=$1 AND operation_id=$2`,
    [op.userId, op.operationId, age]);
    await tx.query(`ALTER TABLE shift_presence_operations ENABLE TRIGGER USER`);
  });
}

describe("scope-safe recovery without retained raw evidence", () => {
  it("recovers from a fresh transaction using only current scope and opaque identity", async () => {
    const op = await operation();
    await presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, op));
    const result = await presenceTransaction(context.runtimePool, (tx) => readPresenceOperationStatus(tx, scope(op), op.operationId));
    expect(result).toEqual({ state: "PENDING" });
    expect(await presenceTransaction(context.runtimePool, (tx) => readPresenceOperationStatus(tx, scope(op), randomUUID()))).toEqual({ state: "EXPIRED" });
    const other = await operation();
    expect(await presenceTransaction(context.runtimePool, (tx) => readPresenceOperationStatus(tx, scope(other), op.operationId))).toEqual({ state: "EXPIRED" });
    const otherLocation = await context.addLocation(op);
    expect(await presenceTransaction(context.runtimePool, (tx) => readPresenceOperationStatus(tx, { ...scope(op), locationId: otherLocation }, op.operationId))).toEqual({ state: "EXPIRED" });
    await expect(presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, { ...op, locationId: otherLocation }))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
  });
  it("returns minimal terminal facts for 14 days then only EXPIRED while still rejecting changed fingerprints", async () => {
    const op = await operation();
    await presenceTransaction(context.runtimePool, async (tx) => {
      await allocatePresenceChallenge(tx, op);
      await bindPresenceAttempt(tx, op, fingerprint);
      await completePresenceOperation(tx, op, { status: "DENIED", shiftId: null, decisionId: null });
    });
    const read = () => presenceTransaction(context.runtimePool, (tx) => readPresenceRecovery(tx, op, fingerprint));
    expect(await read()).toEqual({ state: "RECOVERABLE", status: "DENIED", shiftId: null, decisionId: null });
    await expect(presenceTransaction(context.runtimePool, (tx) => requestPresenceException(tx, op, "GPS_UNAVAILABLE"))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_EXPIRED" });
    await backdateTerminal(op, "13 days 23 hours");
    expect((await read()).state).toBe("RECOVERABLE");
    await backdateTerminal(op, "14 days 1 second");
    expect(await read()).toEqual({ state: "EXPIRED" });
    expect(await presenceTransaction(context.runtimePool, (tx) => readPresenceOperationStatus(tx, scope(op), op.operationId))).toEqual({ state: "EXPIRED" });
    await expect(presenceTransaction(context.runtimePool, (tx) => readPresenceRecovery(tx, op, "c".repeat(64)))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    await expect(presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, op))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_EXPIRED" });
    await expect(presenceTransaction(context.runtimePool, (tx) => completePresenceOperation(tx, op, { status: "DENIED", shiftId: null, decisionId: null }))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
  });
  it("leaves no reservation when the caller rolls allocation back", async () => {
    const op = await operation();
    await expect(presenceTransaction(context.runtimePool, async (tx) => {
      await allocatePresenceChallenge(tx, op);
      throw new Error("synthetic rollback");
    })).rejects.toThrow("synthetic rollback");
    expect(await presenceTransaction(context.runtimePool, (tx) => readPresenceRecovery(tx, op, fingerprint))).toEqual({ state: "EXPIRED" });
    expect((await context.adminPool.query(`SELECT count(*)::int AS count FROM shift_presence_challenges WHERE user_id=$1`, [op.userId])).rows[0].count).toBe(0);
  });
  it("deduplicates exact exception requests and rejects controlled-reason changes", async () => {
    const op = await operation();
    await presenceTransaction(context.runtimePool, (tx) => allocatePresenceChallenge(tx, op));
    const request = () => presenceTransaction(context.runtimePool, (tx) => requestPresenceException(tx, op, "GPS_UNAVAILABLE"));
    const first = await request();
    expect((await request()).id).toBe(first.id);
    await expect(presenceTransaction(context.runtimePool, (tx) => requestPresenceException(tx, op, "OUTSIDE_ZONE"))).rejects.toMatchObject({ code: "PRESENCE_OPERATION_CONFLICT" });
    await expect(presenceTransaction(context.runtimePool, (tx) => requestPresenceException(tx, op, "free text"))).rejects.toThrow();
    expect((await context.adminPool.query(`SELECT count(*)::int AS count FROM shift_presence_exceptions WHERE user_id=$1`, [op.userId])).rows[0].count).toBe(1);
  });
  it("reads nullable overrides from persistence and revisions advance only for real changes", async () => {
    const op = await operation();
    const read = () => presenceTransaction(context.runtimePool, (tx) => lockShiftPresenceConfiguration(tx, op));
    const initial = await read();
    await context.adminPool.query(`UPDATE organizations SET shift_presence_max_accuracy_meters=25 WHERE id=$1`, [op.organizationId]);
    await context.adminPool.query(`UPDATE locations SET shift_presence_max_accuracy_meters_override=40 WHERE id=$1`, [op.locationId]);
    const overridden = await read();
    expect(overridden.policy.maxAccuracyMeters).toBe(40);
    expect(overridden.companyRevision).toBe(2);
    expect(overridden.locationRevision).toBe(2);
    expect(overridden.fingerprint).not.toBe(initial.fingerprint);
    await context.adminPool.query(`UPDATE locations SET shift_presence_max_accuracy_meters_override=40 WHERE id=$1`, [op.locationId]);
    expect((await read()).fingerprint).toBe(overridden.fingerprint);
    await context.adminPool.query(`UPDATE locations SET shift_presence_max_accuracy_meters_override=NULL WHERE id=$1`, [op.locationId]);
    const inherited = await read();
    expect(inherited.policy.maxAccuracyMeters).toBe(25);
    expect(inherited.locationRevision).toBe(3);
    expect(inherited.policy.startMode).toBe("OFF");
    expect(inherited.policy.endMode).toBe("OFF");
  });
});

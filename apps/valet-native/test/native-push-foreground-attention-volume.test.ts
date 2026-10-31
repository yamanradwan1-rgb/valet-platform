import { describe, expect, it } from "vitest";

import { NativePushForegroundAttentionOwner } from "../src/notifications/native-push-foreground-attention";
import {
  authenticated,
  deferred,
  loggedOut,
  pushHarness,
  validWirePayload,
} from "./native-push-fixture";

function syntheticIntentId(sequence: number): string {
  return `20000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

describe("Native foreground attention boundaries", () => {
  it("deduplicates valid receipts and supports explicit dismissal", () => {
    const owner = new NativePushForegroundAttentionOwner();
    const first = validWirePayload(syntheticIntentId(1));
    expect(owner.receive(first, true)).toBeUndefined();
    owner.setForeground(true);
    expect(owner.receive(first, true)).toEqual([first.intentId]);
    expect(owner.receive(first, true)).toBeUndefined();
    expect(owner.dismiss(first.intentId)).toEqual([]);
    expect(owner.dismiss(first.intentId)).toBeUndefined();
    expect(owner.receive(first, true)).toEqual([first.intentId]);
    owner.clear();
    expect(owner.dismiss(first.intentId)).toBeUndefined();
  });

  it("evicts the oldest admission at 65 without moving a retained duplicate", () => {
    const owner = new NativePushForegroundAttentionOwner();
    owner.setForeground(true);
    for (let sequence = 1; sequence <= 64; sequence += 1) {
      const retained = owner.receive(
        validWirePayload(syntheticIntentId(sequence)),
        true,
      );
      if (sequence === 63) expect(retained).toHaveLength(63);
      if (sequence === 64) expect(retained).toHaveLength(64);
    }
    expect(
      owner.receive(validWirePayload(syntheticIntentId(1)), true),
    ).toBeUndefined();
    expect(
      owner.receive(validWirePayload(syntheticIntentId(65)), true),
    ).toEqual(
      Array.from({ length: 64 }, (_, index) => syntheticIntentId(index + 2)),
    );
  });

  it("admits an evicted replay as newest, and dismissal frees a FIFO slot", () => {
    const owner = new NativePushForegroundAttentionOwner();
    owner.setForeground(true);
    for (let sequence = 1; sequence <= 65; sequence += 1) {
      owner.receive(validWirePayload(syntheticIntentId(sequence)), true);
    }
    const replayed = owner.receive(
      validWirePayload(syntheticIntentId(1)),
      true,
    );
    expect(replayed).toEqual([
      ...Array.from({ length: 63 }, (_, index) => syntheticIntentId(index + 3)),
      syntheticIntentId(1),
    ]);
    expect(
      owner.receive(validWirePayload(syntheticIntentId(1)), true),
    ).toBeUndefined();
    expect(owner.dismiss(syntheticIntentId(32))).toHaveLength(63);
    const afterFreeSlot = owner.receive(
      validWirePayload(syntheticIntentId(66)),
      true,
    );
    expect(afterFreeSlot).toHaveLength(64);
    expect(afterFreeSlot).toEqual([
      ...Array.from({ length: 63 }, (_, index) => index + 3)
        .filter((value) => value !== 32)
        .map(syntheticIntentId),
      syntheticIntentId(1),
      syntheticIntentId(66),
    ]);
  });

  it("rejects malformed, background, and stale identity receipts", async () => {
    const harness = pushHarness();
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    await harness.owner.setForeground(true);
    await harness.owner.setAuth(authenticated(1));

    for (const payload of [
      null,
      { ...validWirePayload(), taskId: "forbidden" },
      { ...validWirePayload(), schemaVersion: "2" },
      { ...validWirePayload(), kind: "EMPLOYEE_TASK_ASSIGNED" },
      { ...validWirePayload(), routeIntent: "RELEASE_VEHICLE" },
    ]) {
      harness.owner.receiveForeground(payload, 1);
    }
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(1)), 0);
    await harness.owner.setForeground(false);
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(2)), 1);
    expect(harness.owner.current().attentionIntentIds).toEqual([]);

    await harness.owner.setForeground(true);
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(3)), 1);
    expect(harness.owner.current().attentionIntentIds).toEqual([
      syntheticIntentId(3),
    ]);

    await harness.owner.setAuth(loggedOut(2));
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(4)), 1);
    await harness.owner.setAuth(authenticated(3));
    const lateOldGenerationReceipt = () =>
      harness.owner.receiveForeground(
        validWirePayload(syntheticIntentId(5)),
        1,
      );
    lateOldGenerationReceipt();
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(6)), 3);
    expect(harness.owner.current().attentionIntentIds).toEqual([
      syntheticIntentId(6),
    ]);
    harness.owner.dispose();
  });

  it("drops old-generation callbacks delayed through purge and account replacement", async () => {
    const harness = pushHarness();
    await harness.owner.setForeground(true);
    await harness.owner.setAuth(authenticated(1));
    const deletion = deferred<void>();
    harness.platform.deletePromise = deletion.promise;
    const duringPurge = deferred<void>();
    const afterReplacement = deferred<void>();
    const oldDuring = duringPurge.promise.then(() =>
      harness.owner.receiveForeground(
        validWirePayload(syntheticIntentId(8)),
        1,
      ),
    );
    const oldAfter = afterReplacement.promise.then(() =>
      harness.owner.receiveForeground(
        validWirePayload(syntheticIntentId(9)),
        1,
      ),
    );

    const purge = harness.owner.purgeIdentity();
    duringPurge.resolve();
    await oldDuring;
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    deletion.resolve();
    await purge;
    await harness.owner.setAuth(loggedOut(2));
    await harness.owner.setAuth(authenticated(3));
    afterReplacement.resolve();
    await oldAfter;
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(10)), 3);
    expect(harness.owner.current().attentionIntentIds).toEqual([
      syntheticIntentId(10),
    ]);
    harness.owner.dispose();
  });

  it("keeps all rapid receipt and dismiss snapshots within 64", () => {
    const owner = new NativePushForegroundAttentionOwner();
    owner.setForeground(true);
    for (let sequence = 1; sequence <= 256; sequence += 1) {
      const intentId = syntheticIntentId(sequence);
      expect(
        owner.receive(validWirePayload(intentId), true)?.length,
      ).toBeLessThanOrEqual(64);
      if (sequence % 3 === 0) {
        expect(owner.dismiss(intentId)?.length).toBeLessThanOrEqual(64);
      }
    }
  });

  it("caps high-volume retention and published array-copy work at 64", async () => {
    const harness = pushHarness();
    await harness.owner.setForeground(true);
    await harness.owner.setAuth(authenticated(1));
    const observedLengths: number[] = [];
    let receiving = false;
    const unsubscribe = harness.owner.subscribe((snapshot) => {
      if (receiving) {
        observedLengths.push(snapshot.attentionIntentIds.length);
      }
    });
    const sent = new Set<string>();
    const checkpoints: Array<{ sent: number; retained: number }> = [];
    let firstSnapshot: readonly string[] = [];

    for (let sequence = 1; sequence <= 1000; sequence += 1) {
      const intentId = syntheticIntentId(sequence);
      sent.add(intentId);
      const registrationsBeforeReceipt = harness.registration.calls.length;
      receiving = true;
      harness.owner.receiveForeground(validWirePayload(intentId), 1);
      receiving = false;
      expect(harness.registration.calls).toHaveLength(
        registrationsBeforeReceipt,
      );
      if (sequence === 1)
        firstSnapshot = harness.owner.current().attentionIntentIds;
      if ([1, 64, 65, 1000].includes(sequence)) {
        checkpoints.push({
          sent: sequence,
          retained: harness.owner.current().attentionIntentIds.length,
        });
      }
      if (sequence === 65) {
        await harness.owner.setForeground(false);
        const beforeBackgroundReceipt =
          harness.owner.current().attentionIntentIds;
        harness.owner.receiveForeground(
          validWirePayload(syntheticIntentId(2000)),
          1,
        );
        expect(harness.owner.current().attentionIntentIds).toBe(
          beforeBackgroundReceipt,
        );
        await harness.owner.setForeground(true);
      }
    }

    const current = harness.owner.current().attentionIntentIds;
    const copiedElements = observedLengths.reduce(
      (sum, length) => sum + length,
      0,
    );
    console.info(
      "native foreground attention synthetic volume",
      JSON.stringify({
        checkpoints,
        publishes: observedLengths.length,
        copiedElements,
      }),
    );
    expect(new Set(current).size).toBe(current.length);
    expect(current.every((intentId) => sent.has(intentId))).toBe(true);
    expect(firstSnapshot).toEqual([syntheticIntentId(1)]);
    expect(checkpoints).toEqual([
      { sent: 1, retained: 1 },
      { sent: 64, retained: 64 },
      { sent: 65, retained: 64 },
      { sent: 1000, retained: 64 },
    ]);
    expect(current).toEqual(
      Array.from({ length: 64 }, (_, index) => syntheticIntentId(index + 937)),
    );
    expect(Math.max(...observedLengths)).toBe(64);
    expect(copiedElements).toBe(61984);
    unsubscribe();
    await harness.owner.setAuth(loggedOut(2));
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    harness.owner.receiveForeground(
      validWirePayload(syntheticIntentId(2001)),
      1,
    );
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
    harness.owner.dispose();
    expect(harness.owner.current().attentionIntentIds).toEqual([]);
  });
});

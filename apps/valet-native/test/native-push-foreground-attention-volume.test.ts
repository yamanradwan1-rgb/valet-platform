import { describe, expect, it } from "vitest";

import { NativePushForegroundAttentionOwner } from "../src/notifications/native-push-foreground-attention";
import {
  authenticated,
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

  it("rejects malformed, background, and stale identity receipts", async () => {
    const harness = pushHarness();
    await harness.owner.setForeground(true);
    await harness.owner.setAuth(authenticated(1));

    harness.owner.receiveForeground(
      { ...validWirePayload(), taskId: "forbidden" },
      1,
    );
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
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(5)), 1);
    harness.owner.receiveForeground(validWirePayload(syntheticIntentId(6)), 3);
    expect(harness.owner.current().attentionIntentIds).toEqual([
      syntheticIntentId(6),
    ]);
    harness.owner.dispose();
  });

  it("measures high-volume retention and published array-copy work without selecting a cap", async () => {
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

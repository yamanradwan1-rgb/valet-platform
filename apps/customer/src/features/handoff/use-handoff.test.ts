import { describe, expect, it, vi } from "vitest";

import { GuestApiError } from "../../lib/api/api-error";
import type {
  GuestHandoffMaterial,
  GuestSafeSession,
} from "../../lib/api/guest-api-types";
import {
  classifyHandoffRecovery,
  handoffSecondsRemaining,
  runHandoffMutation,
} from "./use-handoff";

const MATERIAL: GuestHandoffMaterial = {
  valetSessionId: "11111111-1111-4111-8111-111111111111",
  state: "HANDOFF_PENDING",
  method: "PICKUP_CODE",
  pickupCode: "1234",
  expiresAt: "2026-10-08T16:00:10.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function coordinatorFixture() {
  let activeGeneration = 1;
  let lockedGeneration: number | null = null;
  const finishCalls: Array<{
    generation: number;
    snapshot: GuestSafeSession | undefined;
  }> = [];
  const beginMutation = () => {
    if (lockedGeneration === activeGeneration) return null;
    const generation = activeGeneration;
    lockedGeneration = generation;
    return {
      isCurrent: () => generation === activeGeneration,
      finish: async (snapshot?: GuestSafeSession) => {
        finishCalls.push({ generation, snapshot });
        if (lockedGeneration === generation) lockedGeneration = null;
      },
    };
  };
  return {
    beginMutation,
    finishCalls,
    replaceVisit: () => {
      activeGeneration += 1;
      lockedGeneration = null;
    },
  };
}

describe("handoff mutation fencing", () => {
  it("single-flights rapid issue/rotate/switch attempts", async () => {
    const coordinator = coordinatorFixture();
    const pending = deferred<GuestHandoffMaterial>();
    const mutate = vi.fn(() => pending.promise);

    const first = runHandoffMutation(coordinator.beginMutation, mutate);
    const duplicate = await runHandoffMutation(
      coordinator.beginMutation,
      mutate,
    );

    expect(duplicate).toEqual({ kind: "BUSY" });
    expect(mutate).toHaveBeenCalledTimes(1);
    pending.resolve(MATERIAL);
    await expect(first).resolves.toEqual({
      kind: "SUCCESS",
      material: MATERIAL,
    });
  });

  it("cannot restore an old proof after visit replacement and a newer completion", async () => {
    const coordinator = coordinatorFixture();
    const oldIssue = deferred<GuestHandoffMaterial>();
    const oldResult = runHandoffMutation(
      coordinator.beginMutation,
      () => oldIssue.promise,
    );

    coordinator.replaceVisit();
    await expect(
      runHandoffMutation(coordinator.beginMutation, async () => MATERIAL),
    ).resolves.toEqual({ kind: "SUCCESS", material: MATERIAL });

    oldIssue.resolve({ ...MATERIAL, pickupCode: "9999" });
    await expect(oldResult).resolves.toEqual({ kind: "STALE" });
    expect(coordinator.finishCalls.map((call) => call.generation)).toEqual([
      2, 1,
    ]);
  });
});

describe("handoff recovery and expiry", () => {
  it.each([
    ["HANDOFF_VERIFICATION_ALREADY_ISSUED", "ALREADY_ISSUED"],
    ["HANDOFF_VERIFICATION_ALREADY_VERIFIED", "ALREADY_VERIFIED"],
  ] as const)("classifies %s distinctly", (code, expected) => {
    expect(
      classifyHandoffRecovery(
        new GuestApiError({ status: 409, code, message: "safe message" }),
      ),
    ).toBe(expected);
  });

  it("uses wall clock expiry and reaches zero without negative countdowns", () => {
    const expiry = "2026-10-08T16:00:10.000Z";
    expect(
      handoffSecondsRemaining(expiry, Date.parse("2026-10-08T16:00:00.100Z")),
    ).toBe(10);
    expect(
      handoffSecondsRemaining(expiry, Date.parse("2026-10-08T16:00:09.900Z")),
    ).toBe(1);
    expect(
      handoffSecondsRemaining(expiry, Date.parse("2026-10-08T16:00:10.001Z")),
    ).toBe(0);
  });
});

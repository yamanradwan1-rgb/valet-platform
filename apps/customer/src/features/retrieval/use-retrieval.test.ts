import { describe, expect, it, vi } from "vitest";

import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import type { BeginGuestMutation, GuestMutationTicket } from "../session/guest-request-coordinator";
import { runRetrievalMutation } from "./use-retrieval";

const SESSION = {
  valetSessionId: "11111111-1111-4111-8111-111111111111",
  state: "REQUESTED",
} as GuestSafeSession;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function coordinatedMutationFixture() {
  let activeGeneration = 1;
  let lockedGeneration: number | null = null;
  const finishCalls: Array<{
    generation: number;
    snapshot: GuestSafeSession | undefined;
  }> = [];

  const beginMutation: BeginGuestMutation = () => {
    if (lockedGeneration === activeGeneration) return null;
    const generation = activeGeneration;
    lockedGeneration = generation;
    const ticket: GuestMutationTicket = {
      isCurrent: () => generation === activeGeneration,
      finish: async (snapshot) => {
        finishCalls.push({ generation, snapshot });
        if (lockedGeneration === generation) lockedGeneration = null;
      },
    };
    return ticket;
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

describe("runRetrievalMutation", () => {
  it("rejects a rapid duplicate before executing a second POST", async () => {
    const coordinator = coordinatedMutationFixture();
    const pending = deferred<GuestSafeSession>();
    const mutate = vi.fn(() => pending.promise);

    const first = runRetrievalMutation(coordinator.beginMutation, mutate);
    const duplicate = await runRetrievalMutation(
      coordinator.beginMutation,
      mutate,
    );

    expect(duplicate).toEqual({ kind: "BUSY" });
    expect(mutate).toHaveBeenCalledTimes(1);

    pending.resolve(SESSION);
    await expect(first).resolves.toEqual({ kind: "SUCCESS" });
    expect(coordinator.finishCalls).toEqual([
      { generation: 1, snapshot: SESSION },
    ]);
  });

  it("drops a late result from a replaced visit generation", async () => {
    const coordinator = coordinatedMutationFixture();
    const oldRequest = deferred<GuestSafeSession>();
    const first = runRetrievalMutation(
      coordinator.beginMutation,
      () => oldRequest.promise,
    );

    coordinator.replaceVisit();
    await expect(
      runRetrievalMutation(coordinator.beginMutation, async () => SESSION),
    ).resolves.toEqual({ kind: "SUCCESS" });

    oldRequest.resolve(SESSION);
    await expect(first).resolves.toEqual({ kind: "STALE" });
    expect(coordinator.finishCalls).toEqual([
      { generation: 2, snapshot: SESSION },
      { generation: 1, snapshot: undefined },
    ]);
  });

  it("reconciles once after failure without replaying the mutation", async () => {
    const coordinator = coordinatedMutationFixture();
    const failure = new Error("ambiguous transport failure");
    const mutate = vi.fn().mockRejectedValue(failure);

    await expect(
      runRetrievalMutation(coordinator.beginMutation, mutate),
    ).resolves.toEqual({ kind: "FAILED", error: failure });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(coordinator.finishCalls).toEqual([
      { generation: 1, snapshot: undefined },
    ]);
  });
});

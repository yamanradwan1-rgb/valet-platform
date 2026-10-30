import { describe, expect, it, vi } from "vitest";
import type { StaffOperationalContextResponse } from "@valet/employee-client";
import { NativeIncidentContextObserver } from "../src/incident/native-incident-context-observer";
import { contextA, deferred } from "./native-incident-fence-test-fixture";

const response = { contexts: [] } as unknown as StaffOperationalContextResponse;
const contextB = { ...contextA, membershipId: contextA.locationId };
function harness() {
  let identity = 1;
  const incident = {
    recoveryContextFence: () => () => true,
    purgeRecovery: vi.fn(async () => {}),
    fenceRecovery: vi.fn(),
    observeRecoveryContext: vi.fn(async () => {}),
  };
  const resolve = vi.fn(
    async () => contextA as typeof contextA | "invalidated" | null,
  );
  const observer = new NativeIncidentContextObserver(
    incident,
    resolve,
    (generation) => generation === identity,
  );
  return {
    incident,
    resolve,
    observer,
    setIdentity(value: number) {
      identity = value;
    },
  };
}

describe("Issue #377 operational-context continuation authority", () => {
  it("a newer context wins when older resolution completes last", async () => {
    const h = harness();
    const old = deferred<typeof contextA>();
    h.resolve
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(contextB);
    const pending = h.observer.observe(1, response);
    await h.observer.observe(1, response);
    old.resolve(contextA);
    await pending;
    expect(h.incident.observeRecoveryContext.mock.calls).toEqual([[contextB]]);
    expect(h.incident.purgeRecovery).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])(
    "old invalidation purge %s cannot fence a replacement",
    async (outcome) => {
      const h = harness();
      const entered = deferred();
      const cleanup = deferred();
      h.resolve
        .mockResolvedValueOnce("invalidated")
        .mockResolvedValueOnce(contextB);
      h.incident.purgeRecovery.mockImplementationOnce(() => {
        entered.resolve();
        return cleanup.promise;
      });
      const pending = h.observer.observe(1, response);
      await entered.promise;
      await h.observer.observe(1, response);
      if (outcome === "success") cleanup.resolve();
      else cleanup.reject(new Error("synthetic cleanup failure"));
      await pending;
      expect(h.incident.observeRecoveryContext).toHaveBeenLastCalledWith(
        contextB,
      );
      expect(h.incident.fenceRecovery).not.toHaveBeenCalled();
    },
  );

  it.each(["invalidate", "identity"])(
    "%s fences pending resolution before side effects",
    async (boundary) => {
      const h = harness();
      const old = deferred<"invalidated">();
      h.resolve.mockImplementationOnce(() => old.promise);
      const pending = h.observer.observe(1, response);
      if (boundary === "invalidate") h.observer.invalidate();
      else h.setIdentity(2);
      old.resolve("invalidated");
      await pending;
      expect(h.incident.purgeRecovery).not.toHaveBeenCalled();
      expect(h.incident.fenceRecovery).not.toHaveBeenCalled();
    },
  );

  it("a stale identity callback cannot cancel a current identity's pending resolver", async () => {
    const h = harness();
    const current = deferred<typeof contextA>();
    h.setIdentity(2);
    h.resolve.mockImplementationOnce(() => current.promise);
    const pending = h.observer.observe(2, response);
    await h.observer.observe(1, response);
    current.resolve(contextB);
    await pending;
    expect(h.resolve).toHaveBeenCalledTimes(1);
    expect(h.incident.observeRecoveryContext).toHaveBeenCalledWith(contextB);
  });

  it("a stale restore rejection cannot fence a newer context", async () => {
    const h = harness();
    const entered = deferred();
    const restore = deferred();
    h.incident.observeRecoveryContext.mockImplementationOnce(() => {
      entered.resolve();
      return restore.promise;
    });
    const pending = h.observer.observe(1, response);
    await entered.promise;
    await h.observer.observe(1, response);
    restore.reject(new Error("synthetic restore failure"));
    await pending;
    expect(h.incident.fenceRecovery).not.toHaveBeenCalled();
  });

  it("current invalidated context purges before fencing", async () => {
    const h = harness();
    const entered = deferred();
    const cleanup = deferred();
    h.resolve.mockResolvedValueOnce("invalidated");
    h.incident.purgeRecovery.mockImplementationOnce(() => {
      entered.resolve();
      return cleanup.promise;
    });
    const pending = h.observer.observe(1, response);
    await entered.promise;
    expect(h.incident.fenceRecovery).not.toHaveBeenCalled();
    cleanup.resolve();
    await pending;
    expect(h.incident.fenceRecovery).toHaveBeenCalledExactlyOnceWith(
      "recovery-invalidated",
    );
  });

  it("current absent context preserves purge behavior", async () => {
    const h = harness();
    h.resolve.mockResolvedValueOnce(null);
    await h.observer.observe(1, response);
    expect(h.incident.purgeRecovery).toHaveBeenCalledOnce();
    expect(h.incident.fenceRecovery).not.toHaveBeenCalled();
  });

  it.each(["resolve", "purge"])(
    "current %s failure retains unavailable fencing",
    async (boundary) => {
      const h = harness();
      const error = new Error("synthetic unavailable");
      if (boundary === "resolve") h.resolve.mockRejectedValueOnce(error);
      else {
        h.resolve.mockResolvedValueOnce("invalidated");
        h.incident.purgeRecovery.mockRejectedValueOnce(error);
      }
      await h.observer.observe(1, response);
      expect(h.incident.fenceRecovery).toHaveBeenCalledExactlyOnceWith(
        "recovery-unavailable",
      );
    },
  );
});

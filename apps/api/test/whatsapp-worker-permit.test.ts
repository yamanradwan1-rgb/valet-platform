import { describe, expect, it, vi } from "vitest";
import { OutboundDeliveryWorker } from "../src/modules/notifications/worker/outbound-delivery-worker";
import { createWorkerFakes, syntheticClaim } from "./whatsapp-worker-fixture";

const stop = () => new AbortController();

describe("WhatsApp worker committed dispatch permits", () => {
  it("persists a dispatch permit and verifies it again before sending", async () => {
    const ports = createWorkerFakes();
    const trace: string[] = [];
    ports.leases.prepareDispatch.mockImplementation(async () => {
      trace.push("permit-commit");
      return {
        kind: "DISPATCH", attemptId: "attempt", attemptHandle: "handle", remainingMs: 30_000,
      };
    });
    ports.material.confirmPermit.mockImplementation(async () => {
      trace.push("current-db-fence");
      return { remainingMs: 25_000 };
    });
    ports.provider.send.mockImplementation(async () => {
      trace.push("provider-call");
      return { kind: "ACCEPTED", providerMessageId: "mock-id" };
    });
    expect(await new OutboundDeliveryWorker(ports).runBatch(stop().signal)).toBe(1);
    expect(trace).toEqual(["permit-commit", "current-db-fence", "provider-call"]);
    expect(ports.provider.send.mock.calls[0]?.[0]).toMatchObject({
      attemptHandle: "handle",
      guestUrl: `https://guest.example.test/#guestToken=${"A".repeat(43)}`,
    });
    expect(ports.leases.finalizeAttempt).toHaveBeenCalledWith(
      syntheticClaim, "attempt", { kind: "ACCEPTED", providerMessageId: "mock-id" },
    );
  });

  it("does not send if a process dies immediately after the committed marker", async () => {
    const ports = createWorkerFakes();
    const worker = new OutboundDeliveryWorker({
      ...ports,
      afterPermitCommit: async () => { throw new Error("synthetic process termination"); },
    });
    await expect(worker.runBatch(stop().signal)).rejects.toThrow("synthetic process termination");
    expect(ports.leases.prepareDispatch).toHaveBeenCalledTimes(1);
    expect(ports.provider.send).not.toHaveBeenCalled();
    expect(ports.leases.finalizeAttempt).not.toHaveBeenCalled();
  });

  it.each(["SUPPRESSED", "EXPIRED", "LOST_LEASE", "RATE_LIMITED"] as const)(
    "does not load a secret or call provider for %s",
    async (kind) => {
      const ports = createWorkerFakes();
      ports.leases.prepareDispatch.mockResolvedValue({ kind } as never);
      await new OutboundDeliveryWorker(ports).runBatch(stop().signal);
      expect(ports.material.loadForPermit).not.toHaveBeenCalled();
      expect(ports.provider.send).not.toHaveBeenCalled();
    },
  );

  it("suppresses socket creation when consent or generation has changed", async () => {
    const ports = createWorkerFakes();
    ports.material.loadForPermit.mockResolvedValue(undefined as never);
    await new OutboundDeliveryWorker(ports).runBatch(stop().signal);
    expect(ports.provider.send).not.toHaveBeenCalled();
    expect(ports.leases.finalizeAttempt).not.toHaveBeenCalled();
  });

  it("requires a fresh DB lease/kill-switch fence after opening the envelope", async () => {
    const ports = createWorkerFakes();
    ports.material.confirmPermit.mockResolvedValue(undefined as never);
    await new OutboundDeliveryWorker(ports).runBatch(stop().signal);
    expect(ports.provider.send).not.toHaveBeenCalled();
    expect(ports.leases.finalizeAttempt).not.toHaveBeenCalled();
  });

  it("does not send when the DB deadline cannot cover the provider timeout", async () => {
    const ports = createWorkerFakes();
    ports.material.confirmPermit.mockResolvedValue({ remainingMs: 10_000 });
    await new OutboundDeliveryWorker(ports).runBatch(stop().signal);
    expect(ports.provider.send).not.toHaveBeenCalled();
  });

  it("classifies thrown provider or envelope failures conservatively as UNKNOWN", async () => {
    const ports = createWorkerFakes();
    ports.provider.send.mockRejectedValue(new Error("may have accepted"));
    await new OutboundDeliveryWorker(ports).runBatch(stop().signal);
    expect(ports.leases.finalizeAttempt).toHaveBeenCalledWith(
      syntheticClaim, expect.any(String), { kind: "UNKNOWN", reason: "TRANSPORT" },
    );
    const broken = createWorkerFakes();
    broken.opener.open.mockImplementation(() => { throw new Error("invalid label"); });
    await new OutboundDeliveryWorker(broken).runBatch(stop().signal);
    expect(broken.provider.send).not.toHaveBeenCalled();
    expect(broken.leases.finalizeAttempt).toHaveBeenCalledWith(
      syntheticClaim, expect.any(String), { kind: "UNKNOWN", reason: "TRANSPORT" },
    );
  });

  it("passes only definite provider nonacceptance to the durable retry policy", async () => {
    const ports = createWorkerFakes();
    ports.provider.send.mockResolvedValue({
      kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: 60,
    } as never);
    await new OutboundDeliveryWorker(ports).runBatch(stop().signal);
    expect(ports.leases.finalizeAttempt).toHaveBeenCalledWith(
      syntheticClaim, expect.any(String),
      { kind: "NOT_ACCEPTED", reason: "RATE_LIMIT", retryAfterSeconds: 60 },
    );
  });

  it("times out an unresolved provider call as UNKNOWN and aborts its socket signal", async () => {
    vi.useFakeTimers();
    try {
      const ports = createWorkerFakes();
      let signal: AbortSignal | undefined;
      ports.provider.send.mockImplementation(async (input) => {
        signal = input.signal;
        return new Promise<never>(() => undefined);
      });
      const run = new OutboundDeliveryWorker(ports).runBatch(stop().signal);
      await vi.waitFor(() => expect(ports.provider.send).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(10_000);
      await run;
      expect(signal?.aborted).toBe(true);
      expect(ports.leases.finalizeAttempt).toHaveBeenCalledWith(
        syntheticClaim, expect.any(String), { kind: "UNKNOWN", reason: "TIMEOUT" },
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

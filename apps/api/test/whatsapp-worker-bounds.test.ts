import { describe, expect, it } from "vitest";
import { OUTBOUND_LIMITS } from "../src/modules/notifications/contracts/outbound-lease";
import { OutboundDeliveryWorker } from "../src/modules/notifications/worker/outbound-delivery-worker";
import { canonicalGuestOrigin, prepareOutboundSendInput } from "../src/modules/notifications/worker/outbound-transport-payload";
import { createWorkerFakes, syntheticClaim, syntheticMaterial } from "./whatsapp-worker-fixture";

describe("WhatsApp worker resource and transport guards", () => {
  it("bounds batch size and parallel outbound transport independently of claim count", async () => {
    const ports = createWorkerFakes();
    ports.leases.claimDue.mockResolvedValue(
      Array.from({ length: OUTBOUND_LIMITS.claimBatchSize }, () => syntheticClaim),
    );
    let active = 0;
    let peak = 0;
    ports.provider.send.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { kind: "ACCEPTED", providerMessageId: "synthetic" };
    });
    expect(await new OutboundDeliveryWorker(ports).runBatch(new AbortController().signal))
      .toBe(OUTBOUND_LIMITS.claimBatchSize);
    expect(ports.provider.send).toHaveBeenCalledTimes(OUTBOUND_LIMITS.claimBatchSize);
    expect(peak).toBeLessThanOrEqual(OUTBOUND_LIMITS.maxConcurrencyPerReplica);
    expect(peak).toBeGreaterThan(0);

    const overLimit = createWorkerFakes();
    overLimit.leases.claimDue.mockResolvedValue(
      Array.from({ length: OUTBOUND_LIMITS.claimBatchSize + 1 }, () => syntheticClaim),
    );
    await expect(new OutboundDeliveryWorker(overLimit)
      .runBatch(new AbortController().signal)).rejects.toThrow("OUTBOUND_CLAIM_LIMIT_EXCEEDED");
    expect(overLimit.provider.send).not.toHaveBeenCalled();
  });

  it("does not claim after SIGTERM and avoids sending when SIGTERM arrives after permit", async () => {
    const ports = createWorkerFakes();
    const shutdown = new AbortController();
    shutdown.abort();
    expect(await new OutboundDeliveryWorker(ports).runBatch(shutdown.signal)).toBe(0);
    expect(ports.leases.claimDue).not.toHaveBeenCalled();

    const pending = createWorkerFakes();
    const stop = new AbortController();
    await new OutboundDeliveryWorker({
      ...pending,
      afterPermitCommit: async () => { stop.abort(); },
    }).runBatch(stop.signal);
    expect(pending.provider.send).not.toHaveBeenCalled();
  });

  it("validates canonical HTTPS origin and never allows URL query/bearer redirects", () => {
    expect(canonicalGuestOrigin("https://guest.example.test/")).toBe("https://guest.example.test");
    for (const value of [
      "http://guest.example.test", "https://guest.example.test/subroute",
      "https://guest.example.test/?token=value", "https://guest.example.test/#x",
      "https://user:secret@guest.example.test", "javascript:alert(1)",
    ]) expect(() => canonicalGuestOrigin(value)).toThrow("OUTBOUND_GUEST_ORIGIN_INVALID");
  });

  it("rejects malformed decrypted bootstrap and unsafe provider recipient/config", () => {
    const ports = createWorkerFakes();
    expect(() => prepareOutboundSendInput(
      syntheticMaterial, "opaque", "https://guest.example.test",
      new AbortController().signal, { open: () => "bad token" },
    )).toThrow("OUTBOUND_ENVELOPE_INVALID");
    expect(() => prepareOutboundSendInput(
      { ...syntheticMaterial, recipientE164: "123 wrong" }, "opaque",
      "https://guest.example.test", new AbortController().signal, ports.opener,
    )).toThrow("OUTBOUND_TRANSPORT_CONFIG_INVALID");
  });
});

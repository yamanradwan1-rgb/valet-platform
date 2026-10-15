import { describe, expect, it, vi } from "vitest";
import { runOutboundWorkerLoop } from "../src/modules/notifications/worker/outbound-worker-loop";
import { senderDatabaseUrl } from "../src/modules/notifications/worker/outbound-worker-principal";
import { createWorkerFakes } from "./whatsapp-worker-fixture";

describe("WhatsApp worker lifecycle and role separation", () => {
  it("runs bounded cleanup with sending OFF, never claiming or using provider", async () => {
    const ports = createWorkerFakes();
    const stop = new AbortController();
    let cycles = 0;
    await runOutboundWorkerLoop({
      leases: ports.leases,
      worker: { runBatch: vi.fn(async () => 1) },
      checkReady: vi.fn(async () => undefined),
      sendingEnabled: false,
      afterCycle: ({ claimed, purged }) => {
        expect(claimed).toBe(0);
        expect(purged).toBe(0);
        cycles++;
        stop.abort();
      },
    }, stop.signal);
    expect(cycles).toBe(1);
    expect(ports.leases.expireAndPurge).toHaveBeenCalledWith(100);
    expect(ports.leases.claimDue).not.toHaveBeenCalled();
  });

  it("stops after SIGTERM without starting another poll cycle", async () => {
    const ports = createWorkerFakes();
    const stop = new AbortController();
    const runBatch = vi.fn(async () => { stop.abort(); return 1; });
    await runOutboundWorkerLoop({
      leases: ports.leases,
      worker: { runBatch },
      checkReady: async () => undefined,
      sendingEnabled: true,
    }, stop.signal);
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(ports.leases.expireAndPurge).toHaveBeenCalledTimes(1);
  });

  it("fails startup on DB/key readiness errors before any delivery claim", async () => {
    const ports = createWorkerFakes();
    await expect(runOutboundWorkerLoop({
      leases: ports.leases,
      worker: { runBatch: vi.fn(async () => 0) },
      checkReady: async () => { throw new Error("MISSING_SENDER_PRIVILEGE"); },
      sendingEnabled: true,
    }, new AbortController().signal)).rejects.toThrow("MISSING_SENDER_PRIVILEGE");
    expect(ports.leases.claimDue).not.toHaveBeenCalled();
  });

  it("requires an independent restricted sender database principal", () => {
    const base = "postgresql://sender:synthetic@127.0.0.1:5432/test";
    expect(senderDatabaseUrl({
      DATABASE_URL: "postgresql://api:synthetic@127.0.0.1:5432/test",
      OUTBOUND_MESSAGING_WORKER_DATABASE_URL: base,
    })).toBe(base);
    expect(() => senderDatabaseUrl({ DATABASE_URL: base,
      OUTBOUND_MESSAGING_WORKER_DATABASE_URL: base,
    })).toThrow("OUTBOUND_SENDER_ROLE_NOT_DISTINCT");
    expect(() => senderDatabaseUrl({ MIGRATION_DATABASE_URL: base,
      OUTBOUND_MESSAGING_WORKER_DATABASE_URL: base,
    })).toThrow("OUTBOUND_SENDER_ROLE_NOT_DISTINCT");
    expect(() => senderDatabaseUrl({ OUTBOUND_MESSAGING_WORKER_DATABASE_URL: "http://db.invalid" }))
      .toThrow("OUTBOUND_WORKER_OUTBOUND_MESSAGING_WORKER_DATABASE_URL_INVALID");
    expect(() => senderDatabaseUrl({}))
      .toThrow("OUTBOUND_WORKER_OUTBOUND_MESSAGING_WORKER_DATABASE_URL_MISSING");
  });
});

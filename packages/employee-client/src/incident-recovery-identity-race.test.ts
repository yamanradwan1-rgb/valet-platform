import { describe, expect, it } from "vitest";
import { IncidentRecoveryState } from "./incident-recovery-state";
import type {
  IncidentRecoveryStore,
  IncidentRecoveryTransport,
} from "./incident-recovery-types";

const context = {
  installationGeneration: "installation-1",
  locationId: "018f1234-5678-4abc-a234-56789abcdef1",
  membershipId: "018f1234-5678-4abc-a234-56789abcdef2",
  organizationId: "018f1234-5678-4abc-a234-56789abcdef3",
};

describe("Incident recovery identity cleanup", () => {
  it("preserves a fresh marker after a mismatched-context cleanup and purge", async () => {
    let stored: unknown | null = {
      ...context,
      createdAt: "2026-09-12T12:00:00.000Z",
      incidentId: "00010203-0405-8607-8809-0a0b0c0d0e0f",
      protocol: "actor-bound-intent-v1",
      sessionId: "018f1234-5678-4abc-a234-56789abcdef4",
      version: 1,
    };
    let enterFirstDelete!: () => void;
    let releaseFirstDelete!: () => void;
    const firstDeleteStarted = new Promise<void>((resolve) => {
      enterFirstDelete = resolve;
    });
    const firstDeleteGate = new Promise<void>((resolve) => {
      releaseFirstDelete = resolve;
    });
    let activeDeletes = 0;
    let peakDeletes = 0;
    let deleteCalls = 0;
    const store: IncidentRecoveryStore = {
      async delete() {
        activeDeletes += 1;
        peakDeletes = Math.max(peakDeletes, activeDeletes);
        deleteCalls += 1;
        if (deleteCalls === 1) {
          enterFirstDelete();
          await firstDeleteGate;
        }
        stored = null;
        activeDeletes -= 1;
      },
      async read() {
        return stored;
      },
      async write(marker) {
        stored = marker;
      },
    };
    const transport: IncidentRecoveryTransport = {
      read: async () => {
        throw new Error("Unexpected recovery request");
      },
      reserve: async () => {
        throw new Error("Unexpected reservation");
      },
      retire: async () => {
        throw new Error("Unexpected retirement");
      },
    };
    const recovery = new IncidentRecoveryState(
      store,
      transport,
      () => "00010203-0405-8607-8809-0a0b0c0d0e10",
    );
    const replacementContext = { ...context, membershipId: context.locationId };
    const mismatch = recovery.restore(replacementContext);
    await firstDeleteStarted;
    const purge = recovery.purge();
    const prepareReplacement = recovery.prepare(
      replacementContext,
      "018f1234-5678-4abc-a234-56789abcdef4",
    );
    try {
      // Allow the queued purge's microtasks to run while the first deletion is blocked.
      for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();
      expect(peakDeletes).toBe(1);
    } finally {
      releaseFirstDelete();
      await Promise.all([mismatch, purge, prepareReplacement]);
    }
    expect(deleteCalls).toBe(2);
    expect(stored).toEqual(await prepareReplacement);
  });
});

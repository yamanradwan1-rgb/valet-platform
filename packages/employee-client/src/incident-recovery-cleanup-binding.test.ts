import { describe, expect, it, vi } from "vitest";
import { IncidentRecoveryState } from "./incident-recovery-state";
import type {
  IncidentRecoveryMarker,
  IncidentRecoveryStore,
} from "./incident-recovery-types";

const marker: IncidentRecoveryMarker = {
  installationGeneration: "installation-1",
  locationId: "018f1234-5678-4abc-a234-56789abcdef1",
  membershipId: "018f1234-5678-4abc-a234-56789abcdef2",
  organizationId: "018f1234-5678-4abc-a234-56789abcdef3",
  sessionId: "018f1234-5678-4abc-a234-56789abcdef4",
  incidentId: "00010203-0405-8607-8809-0a0b0c0d0e0f",
  createdAt: "2026-09-12T12:00:00.000Z",
  protocol: "actor-bound-intent-v1",
  version: 1,
};
function harness(initial: unknown = marker) {
  let stored: unknown = initial;
  const store = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: IncidentRecoveryMarker) => {
      stored = value;
    }),
    delete: vi.fn(async () => {
      stored = null;
    }),
  } satisfies IncidentRecoveryStore;
  const transport = { read: vi.fn(), reserve: vi.fn(), retire: vi.fn() };
  return {
    store,
    transport,
    recovery: new IncidentRecoveryState(
      store,
      transport,
      () => marker.incidentId,
    ),
  };
}

describe("resolved cleanup is bound to the exact queued marker", () => {
  it.each([
    "installationGeneration",
    "locationId",
    "membershipId",
    "organizationId",
    "sessionId",
    "incidentId",
    "createdAt",
  ] as const)("preserves a newer %s", async (field) => {
    const value =
      field === "createdAt"
        ? "2026-09-12T12:01:00.000Z"
        : field === "installationGeneration"
          ? "installation-2"
          : "018f1234-5678-4abc-a234-56789abcdef5";
    const replacement = { ...marker, [field]: value };
    const h = harness(replacement);
    await expect(h.recovery.clearResolved(marker)).rejects.toThrow(
      "changed before cleanup",
    );
    expect(await h.store.read()).toEqual(replacement);
    expect(h.store.delete).not.toHaveBeenCalled();
    expect(h.transport.reserve).not.toHaveBeenCalled();
  });

  it("normal exact-marker cleanup and absent-marker retry succeed without replay", async () => {
    const h = harness();
    await h.recovery.clearResolved(marker);
    await h.recovery.clearResolved(marker);
    expect(await h.store.read()).toBeNull();
    expect(h.transport.read).not.toHaveBeenCalled();
    expect(h.transport.reserve).not.toHaveBeenCalled();
    expect(h.transport.retire).not.toHaveBeenCalled();
  });

  it("malformed persisted value fails closed without deleting it", async () => {
    const h = harness({ version: 999 });
    await expect(h.recovery.clearResolved(marker)).rejects.toThrow(
      "changed before cleanup",
    );
    expect(h.store.delete).not.toHaveBeenCalled();
  });

  it("read failure prevents deletion and the storage queue remains usable", async () => {
    const h = harness();
    h.store.read.mockRejectedValueOnce(new Error("synthetic read failure"));
    await expect(h.recovery.clearResolved(marker)).rejects.toThrow(
      "synthetic read failure",
    );
    expect(h.store.delete).not.toHaveBeenCalled();
    await h.recovery.clearResolved(marker);
    expect(await h.store.read()).toBeNull();
  });

  it("delete and deletion-confirmation failures retain existing errors", async () => {
    const h = harness();
    h.store.delete.mockRejectedValueOnce(new Error("synthetic delete failure"));
    await expect(h.recovery.clearResolved(marker)).rejects.toThrow(
      "synthetic delete failure",
    );
    h.store.delete.mockImplementationOnce(async () => {});
    await expect(h.recovery.clearResolved(marker)).rejects.toThrow(
      "deletion was not confirmed",
    );
  });

  it("snapshots expected ownership before waiting on the storage queue", async () => {
    const h = harness();
    const expected = { ...marker };
    const cleanup = h.recovery.clearResolved(expected);
    expected.membershipId = marker.locationId;
    await cleanup;
    expect(await h.store.read()).toBeNull();
  });
});

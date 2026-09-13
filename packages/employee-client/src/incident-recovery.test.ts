import { describe, expect, it, vi } from "vitest";
import { employeeNetworkError } from "./api-error";
import { createIncidentRecoveryId } from "./incident-recovery-id";
import { IncidentRecoveryState } from "./incident-recovery-state";
import { createIncidentRecoveryTransport } from "./incident-recovery-transport";
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
const sessionId = "018f1234-5678-4abc-a234-56789abcdef4";
const recoveryId = "00010203-0405-8607-8809-0a0b0c0d0e0f";

function memoryStore(options: { failWrite?: boolean } = {}) {
  let value: unknown | null = null;
  const store: IncidentRecoveryStore = {
    async delete() {
      value = null;
    },
    async read() {
      return value;
    },
    async write(marker) {
      if (options.failWrite) throw new Error("write failed");
      value = JSON.parse(JSON.stringify(marker)) as unknown;
    },
  };
  return { read: () => value, store };
}

function transport(): IncidentRecoveryTransport & {
  read: ReturnType<typeof vi.fn>;
  reserve: ReturnType<typeof vi.fn>;
  retire: ReturnType<typeof vi.fn>;
} {
  return {
    read: vi.fn().mockResolvedValue({
      incidentId: recoveryId,
      outcome: "UNKNOWN",
      sessionId,
    }),
    reserve: vi.fn().mockResolvedValue({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId: recoveryId,
      outcome: "RESERVED",
      sessionId,
    }),
    retire: vi.fn().mockResolvedValue({
      incidentId: recoveryId,
      outcome: "RETIRED",
      sessionId,
    }),
  };
}

describe("Incident recovery portable state", () => {
  it("generates UUIDv8 by changing only version and variant bits", () => {
    const source = Uint8Array.from({ length: 16 }, (_, index) => index);
    const result = createIncidentRecoveryId({
      getRandomValues(bytes) {
        bytes.set(source);
        return bytes;
      },
    });
    expect(result).toBe(recoveryId);
    expect(result[14]).toBe("8");
    expect(result[19]).toBe("8");
  });

  it("confirms the minimal marker before reservation is callable", async () => {
    const memory = memoryStore();
    const api = transport();
    const state = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => Date.parse("2026-09-12T12:00:00.000Z"),
    );
    const marker = await state.prepare(context, sessionId);
    expect(memory.read()).toEqual(marker);
    expect(Object.keys(marker).sort()).toEqual([
      "createdAt",
      "incidentId",
      "installationGeneration",
      "locationId",
      "membershipId",
      "organizationId",
      "protocol",
      "sessionId",
      "version",
    ]);
    expect(api.reserve).not.toHaveBeenCalled();
    await state.reserve(marker);
    expect(api.reserve).toHaveBeenCalledWith(marker);
  });

  it("never sends locally stored actor or scope claims as server authority", async () => {
    const request = vi.fn(async (input: unknown) => {
      void input;
      return {
        expiresAt: "2026-09-12T12:15:00.000Z",
        incidentId: recoveryId,
        outcome: "RESERVED",
        sessionId,
      };
    });
    const marker = {
      ...context,
      createdAt: "2026-09-12T12:00:00.000Z",
      incidentId: recoveryId,
      protocol: "actor-bound-intent-v1" as const,
      sessionId,
      version: 1 as const,
    };
    await createIncidentRecoveryTransport(() => ({ request }) as never).reserve(
      marker,
    );
    const serializedRequest = JSON.stringify(request.mock.calls[0]![0]);
    expect(serializedRequest).not.toContain(context.membershipId);
    expect(serializedRequest).not.toContain(context.organizationId);
    expect(serializedRequest).not.toContain(context.locationId);
    expect(serializedRequest).not.toContain(context.installationGeneration);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ body: {}, method: "POST" }),
    );
  });

  it("fails before network when marker persistence fails", async () => {
    const api = transport();
    const state = new IncidentRecoveryState(
      memoryStore({ failWrite: true }).store,
      api,
      () => recoveryId,
    );
    await expect(state.prepare(context, sessionId)).rejects.toThrow(
      "write failed",
    );
    expect(api.reserve).not.toHaveBeenCalled();
    expect(api.retire).not.toHaveBeenCalled();
  });

  it("uses GET-only restore and keeps the 24-hour deadline soft", async () => {
    const memory = memoryStore();
    const api = transport();
    const stateA = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => 0,
    );
    const marker = await stateA.prepare(context, sessionId);
    const stateB = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => 24 * 60 * 60 * 1000,
    );
    api.read.mockResolvedValueOnce({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId: recoveryId,
      outcome: "RESERVED",
      sessionId,
    });
    const restored = await stateB.restore(context);
    expect(restored).toMatchObject({
      deadlineReached: true,
      kind: "resolved",
      marker,
      resolution: { outcome: "RESERVED" },
    });
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(api.reserve).not.toHaveBeenCalled();
    expect(api.retire).not.toHaveBeenCalled();
    expect(memory.read()).toEqual(marker);
  });

  it("purges mismatched identity without calling the server", async () => {
    const memory = memoryStore();
    const api = transport();
    const state = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
    );
    await state.prepare(context, sessionId);
    await expect(
      state.restore({ ...context, membershipId: sessionId }),
    ).resolves.toEqual({ kind: "invalidated" });
    expect(memory.read()).toBeNull();
    expect(api.read).not.toHaveBeenCalled();
  });

  it("fails closed when a server response does not match the durable binding", async () => {
    const memory = memoryStore();
    const api = transport();
    api.reserve.mockResolvedValue({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId: "00010203-0405-8607-8809-0a0b0c0d0e00",
      outcome: "RESERVED",
      sessionId,
    });
    const state = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
    );
    const marker = await state.prepare(context, sessionId);
    await expect(state.reserve(marker)).rejects.toThrow(
      "response binding did not match",
    );
    expect(memory.read()).toEqual(marker);
  });

  it("keeps an offline marker at the local deadline until online authority resolves", async () => {
    const memory = memoryStore();
    const api = transport();
    const stateA = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => 0,
    );
    const marker = await stateA.prepare(context, sessionId);
    api.read.mockRejectedValueOnce(employeeNetworkError());
    const stateB = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => 24 * 60 * 60 * 1000,
    );
    await expect(stateB.restore(context)).resolves.toMatchObject({
      deadlineReached: true,
      kind: "resolved",
      resolution: { outcome: "UNAVAILABLE" },
    });
    expect(memory.read()).toEqual(marker);
    api.read.mockResolvedValueOnce({
      incidentId: recoveryId,
      outcome: "RETIRED",
      sessionId,
    });
    await expect(stateB.restore(context)).resolves.toMatchObject({
      deadlineReached: true,
      resolution: { outcome: "RETIRED" },
    });
  });

  it("still accepts authoritative FOUND after the soft local deadline", async () => {
    const memory = memoryStore();
    const api = transport();
    const initial = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => 0,
    );
    await initial.prepare(context, sessionId);
    api.read.mockResolvedValueOnce({
      outcome: "FOUND",
      report: {
        createdAt: "2026-09-12T00:00:01.000Z",
        incidentId: recoveryId,
        reportedByMembershipId: context.membershipId,
        sessionId,
        severity: "LOW",
        status: "OPEN",
        type: "OTHER",
      },
    });
    const later = new IncidentRecoveryState(
      memory.store,
      api,
      () => recoveryId,
      () => 24 * 60 * 60 * 1000,
    );
    await expect(later.restore(context)).resolves.toMatchObject({
      deadlineReached: true,
      resolution: { outcome: "FOUND" },
    });
  });
});

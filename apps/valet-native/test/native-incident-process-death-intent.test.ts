import {
  IncidentRecoveryState,
  employeeNetworkError,
  type IncidentRecoveryMarker,
  type IncidentRecoveryStore,
  type IncidentRecoveryTransport,
} from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";
import { NativeIncidentSession } from "../src/incident/native-incident-session";
import { detail, sessionId } from "./native-parity-11-test-fixture";

const incidentId = "018f1234-5678-8abc-9234-56789abcdef0";
const context = {
  installationGeneration: "installation-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "22222222-2222-4222-8222-222222222222",
};
const input = {
  description: "Process-A-only sensitive description",
  severity: "HIGH" as const,
  type: "VEHICLE_DAMAGE" as const,
};
const report = {
  createdAt: "2026-09-12T12:00:01.000Z",
  incidentId,
  reportedByMembershipId: context.membershipId,
  sessionId,
  severity: input.severity,
  status: "OPEN" as const,
  type: input.type,
};

function durableStore(events?: string[]): IncidentRecoveryStore & {
  serialized: () => string | null;
} {
  let value: string | null = null;
  return {
    async delete() {
      value = null;
    },
    async read() {
      return value === null ? null : JSON.parse(value);
    },
    serialized: () => value,
    async write(marker) {
      events?.push("marker");
      value = JSON.stringify(marker);
    },
  };
}

describe("DEC-077 real fresh-owner Process A to Process B", () => {
  it("recovers commit plus response loss by GET only", async () => {
    const mutationOrder: string[] = [];
    const store = durableStore(mutationOrder);
    let committed = false;
    const processATransport: IncidentRecoveryTransport = {
      read: vi.fn(async (marker) =>
        committed
          ? { outcome: "FOUND" as const, report }
          : {
              ...marker,
              expiresAt: "2026-09-12T12:15:00.000Z",
              outcome: "RESERVED" as const,
            },
      ),
      reserve: vi.fn(async (marker) => {
        mutationOrder.push("reserve");
        return {
          expiresAt: "2026-09-12T12:15:00.000Z",
          incidentId: marker.incidentId,
          outcome: "RESERVED" as const,
          sessionId: marker.sessionId,
        };
      }),
      retire: vi.fn(),
    };
    const processARequest = vi.fn(async (request: { method: string }) => {
      if (request.method === "GET") return detail();
      mutationOrder.push("incident-post");
      committed = true;
      throw employeeNetworkError();
    });
    let processA: NativeIncidentSession | undefined = new NativeIncidentSession(
      () => ({ request: processARequest }) as never,
      new IncidentRecoveryState(store, processATransport, () => incidentId),
    );
    await processA.observeRecoveryContext(context);
    await processA.open({ origin: "PARKING", sessionId });
    expect(await processA.submit(input)).toBe(false);
    expect(processA.current()).toMatchObject({ phase: "success", report });
    expect(mutationOrder).toEqual(["marker", "reserve", "incident-post"]);
    const durable = store.serialized()!;
    expect(durable).not.toContain(input.description);
    expect(durable).not.toContain(input.type);
    expect(durable).not.toContain(input.severity);

    processA = undefined;
    const processBRead = vi.fn(async () => ({
      outcome: "FOUND" as const,
      report,
    }));
    const processBTransport: IncidentRecoveryTransport = {
      read: processBRead,
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const processBRequest = vi.fn();
    const processB = new NativeIncidentSession(
      () => ({ request: processBRequest }) as never,
      new IncidentRecoveryState(store, processBTransport, () => incidentId),
    );
    await processB.observeRecoveryContext(context);
    expect(processB.current()).toMatchObject({ phase: "success", report });
    expect(processBRead).toHaveBeenCalledOnce();
    expect(processBTransport.reserve).not.toHaveBeenCalled();
    expect(processBTransport.retire).not.toHaveBeenCalled();
    expect(processBRequest).not.toHaveBeenCalled();
  });

  it("fresh Process B sees UNKNOWN before reservation and never mutates", async () => {
    const store = durableStore();
    await store.write({
      ...context,
      createdAt: "2026-09-12T12:00:00.000Z",
      incidentId,
      protocol: "actor-bound-intent-v1",
      sessionId,
      version: 1,
    } satisfies IncidentRecoveryMarker);
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(async () => ({
        incidentId,
        outcome: "UNKNOWN" as const,
        sessionId,
      })),
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const processB = new NativeIncidentSession(
      () => ({ request: vi.fn() }) as never,
      new IncidentRecoveryState(store, transport),
    );
    await processB.observeRecoveryContext(context);
    expect(processB.current().phase).toBe("recovery-unknown");
    expect(store.serialized()).toBeNull();
    expect(transport.read).toHaveBeenCalledOnce();
    expect(transport.reserve).not.toHaveBeenCalled();
    expect(transport.retire).not.toHaveBeenCalled();
  });

  it("sends zero network mutation when durable marker writing fails", async () => {
    const store = durableStore();
    store.write = vi.fn(async () => {
      throw new Error("secure write failed");
    });
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(),
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "GET") return detail();
      throw new Error("mutation must not dispatch");
    });
    const session = new NativeIncidentSession(
      () => ({ request }) as never,
      new IncidentRecoveryState(store, transport, () => incidentId),
    );
    await session.observeRecoveryContext(context);
    await session.open({ origin: "PARKING", sessionId });
    await expect(session.submit(input)).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET" }),
    );
    expect(transport.reserve).not.toHaveBeenCalled();
    expect(transport.retire).not.toHaveBeenCalled();
  });

  it("does not reserve when backgrounding wins during marker persistence", async () => {
    let releaseWrite!: () => void;
    let stored: IncidentRecoveryMarker | null = null;
    const store: IncidentRecoveryStore = {
      async delete() {
        stored = null;
      },
      async read() {
        return stored;
      },
      write: vi.fn(
        (marker: IncidentRecoveryMarker) =>
          new Promise<void>((resolve) => {
            releaseWrite = () => {
              stored = marker;
              resolve();
            };
          }),
      ),
    };
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(),
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "GET") return detail();
      throw new Error("mutation must not dispatch");
    });
    const session = new NativeIncidentSession(
      () => ({ request }) as never,
      new IncidentRecoveryState(store, transport, () => incidentId),
    );
    await session.observeRecoveryContext(context);
    await session.open({ origin: "PARKING", sessionId });
    const pending = session.submit(input);
    await vi.waitFor(() => expect(store.write).toHaveBeenCalledOnce());
    session.suspendForBackground();
    releaseWrite();
    await expect(pending).resolves.toBe(false);
    expect(transport.reserve).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not downgrade recovery-aware Native while context is unavailable", async () => {
    const store = durableStore();
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(),
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "GET") return detail();
      throw new Error("legacy downgrade must not dispatch");
    });
    const session = new NativeIncidentSession(
      () => ({ request }) as never,
      new IncidentRecoveryState(store, transport),
    );
    await session.open({ origin: "PARKING", sessionId });
    await expect(session.submit(input)).resolves.toBe(false);
    expect(session.current().phase).toBe("recovery-unavailable");
    expect(request).toHaveBeenCalledTimes(1);
    expect(transport.reserve).not.toHaveBeenCalled();
  });

  it("fences only the Incident surface until failed secure cleanup succeeds", async () => {
    const store = durableStore();
    await store.write({
      ...context,
      createdAt: "2026-09-12T12:00:00.000Z",
      incidentId,
      protocol: "actor-bound-intent-v1",
      sessionId,
      version: 1,
    });
    store.delete = vi.fn(async () => {
      throw new Error("secure delete failed");
    });
    const transport: IncidentRecoveryTransport = {
      read: vi.fn(async () => ({
        expiresAt: "2026-09-12T12:15:00.000Z",
        incidentId,
        outcome: "RESERVED" as const,
        sessionId,
      })),
      reserve: vi.fn(),
      retire: vi.fn(),
    };
    const clientRequest = vi.fn();
    const session = new NativeIncidentSession(
      () => ({ request: clientRequest }) as never,
      new IncidentRecoveryState(store, transport),
    );
    await session.observeRecoveryContext(context);
    await expect(session.purgeRecovery()).rejects.toThrow(
      "secure delete failed",
    );
    expect(session.current().phase).toBe("recovery-unavailable");
    await session.open({ origin: "PARKING", sessionId });
    expect(clientRequest).not.toHaveBeenCalled();
  });
});

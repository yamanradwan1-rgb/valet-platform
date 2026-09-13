import {
  IncidentRecoveryState,
  employeeNetworkError,
  type IncidentRecoveryMarker,
  type IncidentRecoveryStore,
  type IncidentRecoveryTransport,
} from "@valet/employee-client";
import { expect, it, vi } from "vitest";

import { NativeIncidentSession } from "../src/incident/native-incident-session";
import { detail, sessionId } from "./native-parity-11-test-fixture";

const incidentId = "018f1234-5678-8abc-9234-56789abcdef0";
const context = {
  installationGeneration: "installation-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "22222222-2222-4222-8222-222222222222",
};
const marker: IncidentRecoveryMarker = {
  ...context,
  createdAt: "2026-09-12T12:00:00.000Z",
  incidentId,
  protocol: "actor-bound-intent-v1",
  sessionId,
  version: 1,
};

function memoryStore(): IncidentRecoveryStore {
  let stored: IncidentRecoveryMarker | null = null;
  return {
    async delete() {
      stored = null;
    },
    async read() {
      return stored;
    },
    async write(value) {
      stored = value;
    },
  };
}

it("uses canonical GET after a lost reservation response and never posts", async () => {
  const store = memoryStore();
  let serverReserved = false;
  const transport: IncidentRecoveryTransport = {
    read: vi.fn(async () => ({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId,
      outcome: serverReserved ? ("RESERVED" as const) : ("UNKNOWN" as const),
      sessionId,
    })),
    reserve: vi.fn(async () => {
      serverReserved = true;
      throw employeeNetworkError();
    }),
    retire: vi.fn(),
  };
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "GET") return detail();
    throw new Error("Incident POST must not dispatch");
  });
  let processA: NativeIncidentSession | undefined = new NativeIncidentSession(
    () => ({ request }) as never,
    new IncidentRecoveryState(store, transport, () => incidentId),
  );
  await processA.observeRecoveryContext(context);
  await processA.open({ origin: "PARKING", sessionId });
  await expect(
    processA.submit({
      description: "sensitive",
      severity: "LOW",
      type: "OTHER",
    }),
  ).resolves.toBe(false);
  expect(processA.current().phase).toBe("recovery-reserved");
  expect(request).toHaveBeenCalledTimes(1);
  processA = undefined;

  const processB = new NativeIncidentSession(
    () => ({ request: vi.fn() }) as never,
    new IncidentRecoveryState(store, transport),
  );
  await processB.observeRecoveryContext(context);
  expect(processB.current().phase).toBe("recovery-reserved");
  expect(transport.reserve).toHaveBeenCalledTimes(1);
  expect(transport.retire).not.toHaveBeenCalled();
});

it("stays RESERVED when Process A dies after dispatch but before API work", async () => {
  const store = memoryStore();
  const transport: IncidentRecoveryTransport = {
    read: vi.fn(async () => ({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId,
      outcome: "RESERVED" as const,
      sessionId,
    })),
    reserve: vi.fn(async () => ({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId,
      outcome: "RESERVED" as const,
      sessionId,
    })),
    retire: vi.fn(),
  };
  let dispatched = false;
  const processARequest = vi.fn(async ({ method }: { method: string }) => {
    if (method === "GET") return detail();
    dispatched = true;
    return new Promise<never>(() => {});
  });
  let processA: NativeIncidentSession | undefined = new NativeIncidentSession(
    () => ({ request: processARequest }) as never,
    new IncidentRecoveryState(store, transport, () => incidentId),
  );
  await processA.observeRecoveryContext(context);
  await processA.open({ origin: "PARKING", sessionId });
  void processA.submit({
    description: "Process-A-only text",
    severity: "LOW",
    type: "OTHER",
  });
  await vi.waitFor(() => expect(dispatched).toBe(true));
  processA = undefined;

  const processBRequest = vi.fn();
  const processB = new NativeIncidentSession(
    () => ({ request: processBRequest }) as never,
    new IncidentRecoveryState(store, transport),
  );
  await processB.observeRecoveryContext(context);
  expect(processB.current().phase).toBe("recovery-reserved");
  expect(transport.reserve).toHaveBeenCalledOnce();
  expect(transport.read).toHaveBeenCalledOnce();
  expect(transport.retire).not.toHaveBeenCalled();
  expect(processBRequest).not.toHaveBeenCalled();
});

it("recovers a lost retirement response with a later GET", async () => {
  const store = memoryStore();
  await store.write(marker);
  let retired = false;
  const transport: IncidentRecoveryTransport = {
    read: vi.fn(async () =>
      retired
        ? { incidentId, outcome: "RETIRED" as const, sessionId }
        : {
            expiresAt: "2026-09-12T12:15:00.000Z",
            incidentId,
            outcome: "RESERVED" as const,
            sessionId,
          },
    ),
    reserve: vi.fn(),
    retire: vi.fn(async () => {
      retired = true;
      throw employeeNetworkError();
    }),
  };
  const session = new NativeIncidentSession(
    () => ({ request: vi.fn() }) as never,
    new IncidentRecoveryState(store, transport),
  );
  await session.observeRecoveryContext(context);
  await session.retire();
  expect(session.current().phase).toBe("recovery-unavailable");
  await session.retryRecovery();
  expect(session.current().phase).toBe("recovery-retired");
  await expect(store.read()).resolves.toBeNull();
  expect(transport.retire).toHaveBeenCalledOnce();
  expect(transport.reserve).not.toHaveBeenCalled();
});

it("reopens a dismissed tracked attempt with canonical GET only", async () => {
  const store = memoryStore();
  await store.write(marker);
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
  const request = vi.fn();
  const session = new NativeIncidentSession(
    () => ({ request }) as never,
    new IncidentRecoveryState(store, transport),
  );
  await session.observeRecoveryContext(context);
  session.clear();
  expect(session.current().phase).toBe("inactive");
  await session.open({ origin: "PARKING", sessionId });
  expect(session.current().phase).toBe("recovery-reserved");
  expect(transport.read).toHaveBeenCalledTimes(2);
  expect(transport.reserve).not.toHaveBeenCalled();
  expect(transport.retire).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it("treats caller disconnect as ambiguous until a fresh owner proves FOUND", async () => {
  const store = memoryStore();
  let committed = false;
  const transport: IncidentRecoveryTransport = {
    read: vi.fn(async () =>
      committed
        ? {
            outcome: "FOUND" as const,
            report: {
              createdAt: "2026-09-12T12:00:01.000Z",
              incidentId,
              reportedByMembershipId: context.membershipId,
              sessionId,
              severity: "LOW" as const,
              status: "OPEN" as const,
              type: "OTHER" as const,
            },
          }
        : {
            expiresAt: "2026-09-12T12:15:00.000Z",
            incidentId,
            outcome: "RESERVED" as const,
            sessionId,
          },
    ),
    reserve: vi.fn(async () => ({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId,
      outcome: "RESERVED" as const,
      sessionId,
    })),
    retire: vi.fn(),
  };
  const disconnected = new Promise<never>(() => {});
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "GET") return detail();
    committed = true;
    return disconnected;
  });
  let processA: NativeIncidentSession | undefined = new NativeIncidentSession(
    () => ({ request }) as never,
    new IncidentRecoveryState(store, transport, () => incidentId),
  );
  await processA.observeRecoveryContext(context);
  await processA.open({ origin: "PARKING", sessionId });
  void processA.submit({ description: "lost", severity: "LOW", type: "OTHER" });
  await vi.waitFor(() => expect(committed).toBe(true));
  processA = undefined;

  const processB = new NativeIncidentSession(
    () => ({ request: vi.fn() }) as never,
    new IncidentRecoveryState(store, transport),
  );
  await processB.observeRecoveryContext(context);
  expect(processB.current().phase).toBe("success");
  expect(transport.read).toHaveBeenCalledOnce();
  expect(transport.retire).not.toHaveBeenCalled();
});

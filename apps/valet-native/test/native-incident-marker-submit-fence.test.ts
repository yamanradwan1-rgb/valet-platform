import {
  IncidentRecoveryState,
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

it("allows only one submit while durable marker confirmation is pending", async () => {
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
      (value: IncidentRecoveryMarker) =>
        new Promise<void>((resolve) => {
          releaseWrite = () => {
            stored = value;
            resolve();
          };
        }),
    ),
  };
  const transport: IncidentRecoveryTransport = {
    read: vi.fn(),
    reserve: vi.fn(async () => ({
      expiresAt: "2026-09-12T12:15:00.000Z",
      incidentId,
      outcome: "RESERVED" as const,
      sessionId,
    })),
    retire: vi.fn(),
  };
  const request = vi.fn(async ({ method }: { method: string }) =>
    method === "GET"
      ? detail()
      : {
          createdAt: "2026-09-12T12:00:01.000Z",
          incidentId,
          reportedByMembershipId: context.membershipId,
          sessionId,
          severity: "HIGH",
          status: "OPEN",
          type: "VEHICLE_DAMAGE",
        },
  );
  const session = new NativeIncidentSession(
    () => ({ request }) as never,
    new IncidentRecoveryState(store, transport, () => incidentId),
  );
  await session.observeRecoveryContext(context);
  await session.open({ origin: "PARKING", sessionId });
  const input = {
    description: "Sensitive in-memory text",
    severity: "HIGH" as const,
    type: "VEHICLE_DAMAGE" as const,
  };
  const first = session.submit(input);
  await vi.waitFor(() => expect(store.write).toHaveBeenCalledOnce());
  await expect(session.submit(input)).resolves.toBe(false);
  releaseWrite();
  await expect(first).resolves.toBe(true);
  expect(transport.reserve).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(2);
});

it("makes identity purge win over an already-started marker write", async () => {
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
      (value: IncidentRecoveryMarker) =>
        new Promise<void>((resolve) => {
          releaseWrite = () => {
            stored = value;
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
  const request = vi.fn(async () => detail());
  const session = new NativeIncidentSession(
    () => ({ request }) as never,
    new IncidentRecoveryState(store, transport, () => incidentId),
  );
  await session.observeRecoveryContext(context);
  await session.open({ origin: "PARKING", sessionId });
  const pendingSubmit = session.submit({
    description: "Sensitive in-memory text",
    severity: "HIGH",
    type: "VEHICLE_DAMAGE",
  });
  await vi.waitFor(() => expect(store.write).toHaveBeenCalledOnce());
  const purge = session.purgeRecovery();
  releaseWrite();
  await expect(pendingSubmit).resolves.toBe(false);
  await expect(purge).resolves.toBeUndefined();
  await expect(store.read()).resolves.toBeNull();
  expect(transport.reserve).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});

import { vi } from "vitest";
import type {
  NativeAuthSession,
  PresenceDescriptor,
  PresenceRecovery,
  StaffOperationalContextResponse,
} from "@valet/employee-client";

const ports = vi.hoisted(() => {
  const descriptors = new Map<string, PresenceDescriptor>();
  return {
    descriptors,
    readDescriptor: vi.fn(async (action: string) => descriptors.get(action)),
    recovery: undefined as PresenceRecovery | undefined,
    recover: vi.fn(),
    submit: vi.fn(),
    challenge: vi.fn(),
    acquire: vi.fn(),
    readChallenge: vi.fn(),
    requestException: vi.fn(),
    readException: vi.fn(),
  };
});
vi.mock("../src/tasks/native-operational-http", () => ({
  createNativeEmployeeClient: vi.fn(),
}));
vi.mock("../src/shift/native-shift-presence-adapter", () => ({
  NativeShiftPresenceAdapter: class {
    acquire = ports.acquire;
    openSettings = vi.fn();
  },
}));
vi.mock("../src/shift/native-shift-presence-store", () => ({
  ExpoShiftPresenceStore: class {
    constructor(private action: string) {}
    async read() {
      return ports.readDescriptor(this.action);
    }
    async write(value: PresenceDescriptor) {
      ports.descriptors.set(this.action, value);
    }
    async delete() {
      ports.descriptors.delete(this.action);
    }
  },
}));
vi.mock("@valet/employee-client", async (original) => {
  const actual = await original<typeof import("@valet/employee-client")>();
  return {
    ...actual,
    createEmployeeShiftPresenceTransport: () => ({
      recover: ports.recover,
      submit: ports.submit,
      challenge: ports.challenge,
      readChallenge: ports.readChallenge,
      requestException: ports.requestException,
      readException: ports.readException,
    }),
  };
});
import {
  EmployeeShiftStartSession,
  EmployeeShiftEndSession,
} from "@valet/employee-client";
import { createNativeShiftPresenceRuntime } from "../src/shift/native-shift-presence-runtime";

export const id = "11111111-1111-4111-8111-111111111111";
export const shift = "22222222-2222-4222-8222-222222222222";
export const startResult = {
  status: "ACTIVE" as const,
  shiftId: shift,
  locationId: id,
  startedAt: "2026-10-04T10:00:00Z",
  endedAt: null,
};
export const endResult = {
  ...startResult,
  status: "ENDED" as const,
  endedAt: "2026-10-04T11:00:00Z",
  cashReconciliation: {
    currency: "JOD",
    cashReported: "1.000",
    cashExpected: "1.000",
    cashVariance: "0.000",
    reportedAt: "2026-10-04T11:00:00Z",
  },
};
export const location = {
  locationId: id,
  code: "AMM",
  name: "Hotel",
  currency: "JOD",
  timezone: "Asia/Amman",
};
export function context(active: boolean): StaffOperationalContextResponse {
  return {
    contexts: [
      {
        membershipId: id,
        organization: { organizationId: id, name: "Operator" },
        role: "VALET_EMPLOYEE",
        eligibleLocations: [],
        currentLocation: active ? location : null,
        activeShift: active
          ? {
              shiftId: shift,
              locationId: id,
              startedAt: startResult.startedAt,
              status: "ACTIVE",
            }
          : null,
      },
    ],
  };
}
export function marker(action: "START" | "END"): PresenceDescriptor {
  return {
    version: 1,
    operationId: id,
    target: {
      identityGeneration: 1,
      membershipId: id,
      organizationId: id,
      locationId: id,
      action,
      shiftId: action === "END" ? shift : null,
      cashReported: action === "END" ? "1" : null,
      ...(action === "END"
        ? {
            currency: "JOD",
            shiftStartedAt: startResult.startedAt,
            role: "VALET_EMPLOYEE" as const,
          }
        : {}),
    },
  };
}
export function setup(
  response: StaffOperationalContextResponse,
  online: () => boolean = () => true,
) {
  const identity = { phase: "authenticated", authGeneration: 2 };
  const runtime = createNativeShiftPresenceRuntime(
    "https://example.invalid",
    { current: () => identity } as unknown as NativeAuthSession,
    online,
  );
  const start = new EmployeeShiftStartSession({
    presence: runtime.start,
    transport: { startShift: vi.fn() },
    refreshOperationalContext: async () => {
      start.observeOperationalContext(2, response);
    },
  });
  const end = new EmployeeShiftEndSession({
    presence: runtime.end,
    loadOperationalContext: async () => response,
    transport: { endShift: vi.fn() },
  });
  runtime.sessions.start = start;
  runtime.sessions.end = end;
  start.activate(2);
  end.activate(2);
  start.observeOperationalContext(2, response);
  end.observeOperationalContext(2, response);
  return { runtime, start, end, identity };
}

export { ports };

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  NativeAuthSession,
  PresenceDescriptor,
  PresenceRecovery,
  StaffOperationalContextResponse,
} from "@valet/employee-client";

const ports = vi.hoisted(() => ({
  descriptors: new Map<string, PresenceDescriptor>(),
  recovery: undefined as PresenceRecovery | undefined,
  recover: vi.fn(),
  submit: vi.fn(),
  challenge: vi.fn(),
  acquire: vi.fn(),
}));
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
      return ports.descriptors.get(this.action);
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
    }),
  };
});
import {
  EmployeeShiftStartSession,
  EmployeeShiftEndSession,
} from "@valet/employee-client";
import { createNativeShiftPresenceRuntime } from "../src/shift/native-shift-presence-runtime";

const id = "11111111-1111-4111-8111-111111111111";
const shift = "22222222-2222-4222-8222-222222222222";
const startResult = {
  status: "ACTIVE" as const,
  shiftId: shift,
  locationId: id,
  startedAt: "2026-10-04T10:00:00Z",
  endedAt: null,
};
const endResult = {
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
const location = {
  locationId: id,
  code: "AMM",
  name: "Hotel",
  currency: "JOD",
  timezone: "Asia/Amman",
};
function context(active: boolean): StaffOperationalContextResponse {
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
function marker(action: "START" | "END"): PresenceDescriptor {
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
function setup(response: StaffOperationalContextResponse) {
  const identity = { phase: "authenticated", authGeneration: 2 };
  const runtime = createNativeShiftPresenceRuntime(
    "https://example.invalid",
    { current: () => identity } as unknown as NativeAuthSession,
    () => true,
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
beforeEach(() => {
  vi.clearAllMocks();
  ports.descriptors.clear();
  ports.recover.mockImplementation(async () => ports.recovery);
});
afterEach(() => vi.unstubAllGlobals());

it.each(["START", "END"] as const)(
  "restart recovers exact %s even after the Shift already changed",
  async (action) => {
    ports.descriptors.set(action, marker(action));
    ports.recovery = {
      state: "RECOVERABLE",
      operationId: id,
      action,
      status: "COMMITTED",
      shiftId: shift,
      decisionId: null,
      denialReason: null,
      summary: null,
      result: action === "START" ? startResult : endResult,
    };
    const s = setup(context(action === "START"));
    expect(ports.descriptors.get(action)).toEqual(marker(action));
    await s.runtime.restore(2, context(action === "START"));
    expect(
      (action === "START" ? s.runtime.start : s.runtime.end).descriptor(),
    ).toBeDefined();
    expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.challenge).not.toHaveBeenCalled();
    expect(ports.acquire).not.toHaveBeenCalled();
    expect(
      action === "START" ? s.start.current().phase : s.end.current().phase,
    ).toBe(action === "START" ? "active" : "ended");
  },
);
it("unknown restart stays uncertain despite visible active Shift", async () => {
  ports.descriptors.set("START", marker("START"));
  ports.recover.mockRejectedValue(new Error("offline"));
  const s = setup(context(true));
  await s.runtime.restore(2, context(true));
  s.start.observeOperationalContext(2, context(true));
  expect(s.start.current().phase).toBe("uncertain");
  expect(ports.submit).not.toHaveBeenCalled();
});
it("a replaced Shift discards its marker", async () => {
  ports.descriptors.set("END", marker("END"));
  const response = context(true);
  response.contexts[0]!.activeShift = {
    ...response.contexts[0]!.activeShift!,
    shiftId: "33333333-3333-4333-8333-333333333333",
  };
  const s = setup(response);
  await s.runtime.restore(2, response);
  expect(ports.recover).not.toHaveBeenCalled();
  expect(ports.descriptors.has("END")).toBe(false);
  await s.runtime.purge();
  expect(s.runtime.start.descriptor()).toBeUndefined();
  expect(s.runtime.end.descriptor()).toBeUndefined();
});

it("detached/inactive membership does not block exact own-End recovery", async () => {
  ports.descriptors.set("END", marker("END"));
  ports.recovery = {
    state: "RECOVERABLE",
    operationId: id,
    action: "END",
    status: "COMMITTED",
    shiftId: shift,
    decisionId: null,
    denialReason: null,
    summary: null,
    result: endResult,
  };
  const response = { contexts: [] };
  const s = setup(response);
  await s.runtime.restore(2, response);
  expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
  expect(s.end.current().phase).toBe("ended");
  expect(ports.submit).not.toHaveBeenCalled();
});

it("detached own-End still challenges and submits OFF with ordinary cash guards", async () => {
  vi.stubGlobal("expo", { uuidv4: () => id });
  const s = setup(context(true));
  const degraded = { contexts: [] };
  s.end.observeOperationalContext(2, degraded);
  await s.runtime.restore(2, degraded);
  ports.challenge.mockImplementation(async (intent) => ({
    operationId: intent.operationId,
    action: "END",
    shiftId: shift,
    locationId: id,
    challengeId: id,
    issuedAt: startResult.startedAt,
    expiresAt: "2026-10-04T10:05:00Z",
    presence: { mode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
  }));
  ports.submit.mockResolvedValue(endResult);
  s.end.setCashInput("1");
  s.end.requestConfirmation();
  await s.end.endShift();
  expect(s.end.current().phase).toBe("ended");
  expect(ports.challenge).toHaveBeenCalledOnce();
  expect(ports.submit).toHaveBeenCalledWith(
    expect.objectContaining({ shiftId: shift, cashReported: "1" }),
    id,
    undefined,
  );
  expect(ports.acquire).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { NativeProductionLifecycleOwner } from "../src/shell/native-production-lifecycle-owner";
import { operations, scope } from "./production-shell-test-fixture";
import {
  ports,
  id,
  shift,
  startResult,
  endResult,
  context,
  location,
  setup,
} from "./native-shift-presence-test-fixture";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
function fixture(action: "START" | "END", mode = "OFF") {
  let online = true;
  const response = context(action === "END");
  response.contexts[0]!.eligibleLocations = [
    location,
    { ...location, locationId: shift },
  ];
  const s = setup(response, () => online);
  const currentScope = {
    ...scope,
    locationId: id,
    membershipId: id,
    organizationId: id,
    shiftId: shift,
  };
  const noop = () => ({
    current: () => ({ phase: "inactive", target: null }),
    clear: vi.fn(),
    suspendForBackground: vi.fn(),
    checkServerState: vi.fn(),
    revalidate: vi.fn(),
    reconcile: vi.fn(),
  });
  const revalidate = vi.fn(async () => {
    s.start.observeOperationalContext(2, response);
    s.end.observeOperationalContext(2, response);
  });
  const native = {
    auth: { current: () => s.identity },
    connectivity: { current: () => "online" },
    shiftStart: s.start,
    shiftEnd: s.end,
    operations: {
      current: () =>
        operations("ready", { generation: 2, retainedScope: currentScope }),
      setForeground: async (active: boolean) => {
        if (active) await revalidate();
      },
      refresh: revalidate,
    },
    checkIn: noop(),
    checkInActions: noop(),
    release: noop(),
    handoff: noop(),
    confirmParking: noop(),
    parking: noop(),
    retrieval: noop(),
    guestAccess: noop(),
    incident: noop(),
    taskTracking: { clear: vi.fn(), setForeground: vi.fn(), setOnline: vi.fn() },
    vehicleDirectory: noop(),
  } as unknown as NativeEmployeeRuntime;
  ports.challenge.mockImplementation(async (intent) => ({
    operationId: intent.operationId,
    challengeId: id,
    action,
    locationId: id,
    shiftId: action === "END" ? shift : null,
    issuedAt: startResult.startedAt,
    expiresAt: "2026-10-04T10:05:00Z",
    presence: { mode, maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
  }));
  ports.readChallenge.mockImplementation(async (operationId) => ({
    ...(await ports.challenge.mock.results[0]!.value),
    operationId,
  }));
  const owner = new NativeProductionLifecycleOwner(native);
  owner.setAppActive(true);
  return {
    ...s,
    owner,
    revalidate,
    offline: () => {
      online = false;
      owner.setConnectivity("offline");
    },
    reconnect: async () => {
      online = true;
      owner.setConnectivity("online");
      await settle();
      await owner.whenIdle();
      await settle();
      await owner.whenIdle();
    },
    dispatch: () => {
      if (action === "START") {
        s.start.selectLocation(id);
        return s.start.start();
      }
      s.end.setCashInput("1");
      s.end.requestConfirmation();
      return s.end.endShift();
    },
    coordinator: action === "START" ? s.runtime.start : s.runtime.end,
    parent: action === "START" ? s.start : s.end,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  ports.descriptors.clear();
  vi.stubGlobal("expo", { uuidv4: () => id });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["START", "END"] as const)(
  "%s already-confirmed result stays settled on offline transition",
  async (action) => {
    const s = fixture(action);
    await s.owner.whenIdle();
    ports.submit.mockResolvedValue(
      action === "START" ? startResult : endResult,
    );
    await s.dispatch();
    if (action === "START") s.start.observeOperationalContext(2, context(true));
    expect(s.parent.current().phase).toBe(
      action === "START" ? "active" : "ended",
    );
    s.offline();
    expect(s.coordinator.snapshot().phase).toBe("confirmed");
    expect(s.parent.current().phase).toBe(
      action === "START" ? "active" : "ended",
    );
    s.owner.dispose();
  },
);

it.each(["START", "END"] as const)(
  "%s offline preserves dispatched O after either late outcome",
  async (action) => {
    for (const outcome of ["reject", "resolve"] as const) {
      ports.descriptors.clear();
      ports.submit.mockClear();
      ports.acquire.mockClear();
      ports.recover.mockClear();
      const s = fixture(action);
      await s.owner.whenIdle();
      const late = deferred<typeof startResult | typeof endResult>();
      ports.submit.mockReturnValue(late.promise);
      const sending = s.dispatch();
      await settle();
      expect(ports.submit).toHaveBeenCalledOnce();
      const descriptor = s.coordinator.descriptor()!;
      expect(descriptor.stage).toBe("SHIFT_MAY_HAVE_LEFT");
      s.offline();
      if (outcome === "reject") late.reject(new Error("connection lost"));
      else late.resolve(action === "START" ? startResult : endResult);
      await sending;
      expect(s.parent.current().phase).toBe("uncertain");
      expect(s.coordinator.snapshot().phase).toBe("uncertain");
      s.start.selectLocation(shift);
      s.end.setCashInput("9");
      expect(s.coordinator.descriptor()).toEqual(descriptor);
      expect(ports.descriptors.get(action)).toEqual(descriptor);
      if (action === "START")
        expect(s.start.current().selectedLocationId).toBe(id);
      else expect(s.end.current().cashInput).toBe("1");
      ports.recover.mockImplementation(async (operationId) => ({
        state: "PENDING",
        operationId,
        exceptionId: null,
      }));
      const validated = s.revalidate.mock.calls.length;
      await s.reconnect();
      expect(s.revalidate.mock.calls.length).toBeGreaterThan(validated);
      expect(ports.recover).toHaveBeenCalledExactlyOnceWith(
        descriptor.operationId,
      );
      expect(ports.submit).toHaveBeenCalledOnce();
      expect(ports.acquire).not.toHaveBeenCalled();
      expect(s.parent.current().phase).toBe("uncertain");
      s.owner.dispose();
    }
  },
);

it.each(["START", "END"] as const)(
  "%s offline before protected dispatch cancels acquisition and requires explicit fresh action",
  async (action) => {
    const s = fixture(action, "REQUIRE");
    await s.owner.whenIdle();
    const late = deferred<unknown>();
    ports.acquire.mockReturnValueOnce(late.promise);
    const sending = s.dispatch();
    await settle();
    expect(s.coordinator.descriptor()!.stage).toBe("LOCAL");
    s.offline();
    late.resolve({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: "2026-10-04T10:00:01Z",
    });
    await sending;
    await s.reconnect();
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.recover).not.toHaveBeenCalled();
    expect(ports.acquire).toHaveBeenCalledOnce();
    vi.stubGlobal("expo", { uuidv4: () => shift });
    ports.acquire.mockResolvedValue({
      latitude: 1,
      longitude: 2,
      accuracyMeters: 10,
      capturedAt: "2026-10-04T10:00:01Z",
    });
    ports.submit.mockResolvedValue(
      action === "START" ? startResult : endResult,
    );
    await s.parent.retry();
    expect(ports.submit).toHaveBeenCalledOnce();
    expect(s.coordinator.descriptor()!.operationId).toBe(shift);
    s.owner.dispose();
  },
);

it.each([
  ["START", "resolve"],
  ["END", "resolve"],
  ["START", "reject"],
  ["END", "reject"],
] as const)(
  "%s offline also fences a manager Exception POST with late %s",
  async (action, outcome) => {
    const s = fixture(action, "REQUIRE_OR_OVERRIDE");
    await s.owner.whenIdle();
    ports.acquire.mockRejectedValue(new Error("no GPS"));
    await s.dispatch();
    expect(s.parent.current().phase).toBe("error");
    const late = deferred<unknown>();
    ports.requestException.mockReturnValue(late.promise);
    const request = s.coordinator.requestManager();
    await settle();
    expect(ports.requestException).toHaveBeenCalledOnce();
    const descriptor = s.coordinator.descriptor()!;
    expect(descriptor.stage).toBe("EXCEPTION_MAY_HAVE_LEFT");
    s.offline();
    if (outcome === "reject") late.reject(new Error("connection lost"));
    else
      late.resolve({
        exceptionId: shift,
        action,
        locationId: id,
        shiftId: action === "END" ? shift : null,
        status: "PENDING",
      });
    await request;
    expect(s.parent.current().phase).toBe("uncertain");
    s.start.selectLocation(shift);
    s.end.setCashInput("9");
    expect(s.coordinator.descriptor()).toEqual(descriptor);
    ports.recover.mockImplementation(async (operationId) => ({
      state: "PENDING",
      operationId,
      exceptionId: shift,
    }));
    ports.readException.mockResolvedValue({
      exceptionId: shift,
      action,
      locationId: id,
      shiftId: action === "END" ? shift : null,
      status: "PENDING",
    });
    await s.reconnect();
    expect(ports.recover).toHaveBeenCalledExactlyOnceWith(id);
    expect(ports.readException).toHaveBeenCalledExactlyOnceWith(shift);
    expect(ports.requestException).toHaveBeenCalledOnce();
    expect(ports.submit).not.toHaveBeenCalled();
    expect(ports.acquire).toHaveBeenCalledOnce();
    s.owner.dispose();
  },
);

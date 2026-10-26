import { vi } from "vitest";
import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { NativeProductionLifecycleOwner } from "../src/shell/native-production-lifecycle-owner";
import { operations, scope } from "./production-shell-test-fixture";
import {
  ports,
  id,
  shift,
  startResult,
  context,
  location,
  setup,
} from "./native-shift-presence-test-fixture";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function settle() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
export function fixture(action: "START" | "END", mode = "OFF") {
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
    taskTracking: {
      clear: vi.fn(),
      setForeground: vi.fn(),
      setOnline: vi.fn(),
    },
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

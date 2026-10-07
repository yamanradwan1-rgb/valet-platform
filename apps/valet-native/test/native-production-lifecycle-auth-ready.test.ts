import { describe, expect, it, vi } from "vitest";
import type { NativeAuthSnapshot } from "@valet/employee-client";

import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { NativeProductionLifecycleOwner } from "../src/shell/native-production-lifecycle-owner";

function workflow() {
  return {
    checkServerState: vi.fn(async () => undefined),
    current: vi.fn(() => ({ phase: "inactive", target: null })),
    revalidate: vi.fn(async () => undefined),
    suspendForBackground: vi.fn(),
  };
}

function fixture(status: "offline" | "online" | "unknown" = "unknown") {
  let auth: NativeAuthSnapshot = { authGeneration: 1, phase: "restoring" };
  const operations = {
    current: vi.fn(() => ({ phase: "ready", scope: null })),
    refresh: vi.fn(async () => undefined),
    setForeground: vi.fn(async () => undefined),
  };
  const runtime = {
    auth: {
      current: vi.fn(() => auth),
      refresh: vi.fn(async () => "refreshed"),
    },
    connectivity: { current: vi.fn(() => status) },
    checkIn: workflow(),
    checkInActions: {
      clear: vi.fn(),
      reconcile: vi.fn(async () => false),
      suspendForBackground: vi.fn(),
    },
    confirmParking: workflow(),
    guestAccess: {
      ...workflow(),
      current: vi.fn(() => ({ mutation: null, target: null })),
    },
    handoff: workflow(),
    incident: workflow(),
    operations,
    parking: workflow(),
    parkingCancellation: workflow(),
    release: workflow(),
    retrieval: workflow(),
    shiftStart: { suspendForBackground: vi.fn() },
    shiftEnd: { setOnline: vi.fn(), suspendForBackground: vi.fn() },
    taskTracking: { clear: vi.fn(), setForeground: vi.fn(), setOnline: vi.fn() },
    vehicleDirectory: {
      current: vi.fn(() => ({ phase: "inactive" })),
      refresh: vi.fn(async () => undefined),
      suspendForBackground: vi.fn(),
    },
  } as unknown as NativeEmployeeRuntime;
  return {
    operations,
    runtime,
    setAuth: (snapshot: NativeAuthSnapshot) => {
      auth = snapshot;
    },
  };
}

async function settle(owner: NativeProductionLifecycleOwner) {
  await Promise.resolve();
  await owner.whenIdle();
  await Promise.resolve();
  await owner.whenIdle();
}

describe("Native production auth-ready lifecycle", () => {
  it("recovers after the only early foreground batch finishes while auth is restoring", async () => {
    const test = fixture();
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    const restoring = { authGeneration: 1, phase: "restoring" } as const;
    owner.observeAuth(restoring);
    owner.setAppActive(true);
    await settle(owner);
    expect(test.operations.setForeground).not.toHaveBeenCalledWith(true);

    const authenticated = {
      authGeneration: 1,
      phase: "authenticated",
    } as const;
    test.setAuth(authenticated);
    owner.observeAuth(authenticated);
    await settle(owner);

    expect(test.operations.setForeground).toHaveBeenCalledTimes(1);
    expect(test.operations.setForeground).toHaveBeenCalledWith(true);
  });

  it("keeps auth-ready pending when it arrives during an active revalidation batch", async () => {
    const test = fixture("online");
    let releaseForeground!: () => void;
    test.operations.setForeground.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          releaseForeground = () => resolve(undefined);
        }),
    );
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    owner.observeAuth({ authGeneration: 1, phase: "restoring" });
    owner.setAppActive(true);

    const authenticated = {
      authGeneration: 1,
      phase: "authenticated",
    } as const;
    test.setAuth(authenticated);
    await Promise.resolve();
    owner.observeAuth(authenticated);
    releaseForeground();
    await settle(owner);

    expect(test.operations.setForeground).toHaveBeenCalledOnce();
    expect(test.operations.refresh).toHaveBeenCalledOnce();
  });

  it("coalesces network recovery before auth and still bootstraps without another event", async () => {
    const test = fixture("unknown");
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    owner.observeAuth({ authGeneration: 1, phase: "restoring" });
    owner.setAppActive(true);
    owner.setConnectivity("online");
    await settle(owner);
    expect(test.operations.setForeground).not.toHaveBeenCalledWith(true);

    const authenticated = {
      authGeneration: 1,
      phase: "authenticated",
    } as const;
    test.setAuth(authenticated);
    owner.observeAuth(authenticated);
    await settle(owner);
    expect(test.operations.setForeground).toHaveBeenCalledTimes(1);
  });

  it("does not force reads while offline and converges after network recovery", async () => {
    const test = fixture("offline");
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    test.operations.setForeground.mockClear();
    owner.observeAuth({ authGeneration: 1, phase: "restoring" });
    owner.setAppActive(true);
    await settle(owner);

    const authenticated = {
      authGeneration: 1,
      phase: "authenticated",
    } as const;
    test.setAuth(authenticated);
    owner.observeAuth(authenticated);
    await settle(owner);
    expect(test.operations.setForeground).not.toHaveBeenCalled();

    owner.setConnectivity("online");
    await settle(owner);
    expect(test.operations.setForeground).toHaveBeenCalledExactlyOnceWith(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { NativeProductionLifecycleOwner } from "../src/shell/native-production-lifecycle-owner";

function workflow(phase = "inactive") {
  return {
    checkServerState: vi.fn(async () => undefined),
    current: vi.fn(() => ({ phase })),
    suspendForBackground: vi.fn(),
  };
}

function fixture(status: "offline" | "online" | "unknown" = "unknown") {
  let authGeneration = 1;
  const operations = {
    current: vi.fn(() => ({ phase: "ready", scope: null })),
    refresh: vi.fn(async () => undefined),
    setForeground: vi.fn(async () => undefined),
  };
  const runtime = {
    auth: {
      current: vi.fn(() => ({ authGeneration, phase: "authenticated" })),
      refresh: vi.fn(async () => "refreshed"),
    },
    connectivity: { current: vi.fn(() => status) },
    checkIn: workflow(),
    confirmParking: workflow(),
    guestAccess: {
      ...workflow(),
      current: vi.fn(() => ({ mutation: null, target: null })),
      revalidate: vi.fn(async () => undefined),
    },
    handoff: workflow(),
    incident: workflow(),
    operations,
    parking: workflow(),
    release: workflow(),
    retrieval: workflow(),
    shiftEnd: { setOnline: vi.fn(), suspendForBackground: vi.fn() },
    vehicleDirectory: {
      current: vi.fn(() => ({ phase: "inactive" })),
      refresh: vi.fn(async () => undefined),
      suspendForBackground: vi.fn(),
    },
  } as unknown as NativeEmployeeRuntime;
  return {
    operations,
    runtime,
    setGeneration: (value: number) => {
      authGeneration = value;
    },
  };
}

async function settle(owner: NativeProductionLifecycleOwner) {
  await Promise.resolve();
  await owner.whenIdle();
  await Promise.resolve();
  await owner.whenIdle();
}

describe("NativeProductionLifecycleOwner", () => {
  it("wires only confirmed offline to shift-end blocking", () => {
    const { runtime } = fixture("offline");
    const owner = new NativeProductionLifecycleOwner(runtime);
    expect(runtime.shiftEnd.setOnline).toHaveBeenLastCalledWith(false);
    owner.setConnectivity("unknown");
    expect(runtime.shiftEnd.setOnline).toHaveBeenLastCalledWith(true);
    owner.setConnectivity("online");
    expect(runtime.shiftEnd.setOnline).toHaveBeenLastCalledWith(true);
  });

  it("coalesces foreground and recovery into bounded safe reads", async () => {
    const { operations, runtime } = fixture();
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    owner.setConnectivity("online");
    owner.setAppActive(true);
    await settle(owner);
    expect(operations.setForeground).toHaveBeenCalledTimes(1);
    expect(operations.refresh).not.toHaveBeenCalled();
  });

  it("holds recovery in background and does not replay commands", async () => {
    const { operations, runtime } = fixture("offline");
    const command = vi.fn();
    Object.assign(runtime, { protectedCommand: command });
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setConnectivity("online");
    await settle(owner);
    expect(operations.setForeground).not.toHaveBeenCalledWith(true);
    owner.setAppActive(true);
    await settle(owner);
    expect(operations.setForeground).toHaveBeenCalledWith(true);
    expect(command).not.toHaveBeenCalled();
  });

  it("fences workflow presentation and polling on background", () => {
    const { operations, runtime } = fixture("online");
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    owner.setAppActive(false);
    expect(operations.setForeground).toHaveBeenCalledWith(false);
    expect(runtime.parking.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.checkIn.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.confirmParking.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.retrieval.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.handoff.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.release.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.incident.suspendForBackground).toHaveBeenCalledOnce();
    expect(runtime.guestAccess.suspendForBackground).toHaveBeenCalledOnce();
    expect(
      runtime.vehicleDirectory.suspendForBackground,
    ).toHaveBeenCalledOnce();
  });

  it("ignores active workflow work after an account switch", async () => {
    let releaseContext!: () => void;
    const { runtime, setGeneration } = fixture("online");
    runtime.operations.setForeground = vi.fn(
      () => new Promise<void>((resolve) => (releaseContext = resolve)),
    );
    runtime.release.current = vi.fn(() => ({ phase: "ready" })) as never;
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    await Promise.resolve();
    setGeneration(2);
    releaseContext();
    await settle(owner);
    expect(runtime.release.checkServerState).not.toHaveBeenCalled();
  });

  it("keeps false-online API failures separate from the network hint", async () => {
    const { operations, runtime } = fixture("online");
    operations.setForeground.mockRejectedValueOnce(new Error("NETWORK_ERROR"));
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(runtime.auth.refresh).not.toHaveBeenCalled();
    expect(runtime.connectivity.current()).toBe("online");
  });

  it("performs one bounded restore retry only on network recovery", async () => {
    const { operations, runtime } = fixture("offline");
    let phase: "authenticated" | "restoration-unavailable" =
      "restoration-unavailable";
    vi.mocked(runtime.auth.current).mockImplementation(() => ({
      authGeneration: 1,
      phase,
    }));
    vi.mocked(runtime.auth.refresh).mockImplementation(async () => {
      phase = "authenticated";
      return "refreshed";
    });
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    owner.setConnectivity("online");
    owner.setConnectivity("online");
    await settle(owner);
    expect(runtime.auth.refresh).toHaveBeenCalledOnce();
    expect(operations.setForeground).toHaveBeenCalledTimes(2);
    expect(operations.setForeground).toHaveBeenLastCalledWith(true);
  });

  it.each(["unauthenticated", "fatal"] as const)(
    "does not bypass %s on reconnect",
    async (phase) => {
      const { runtime } = fixture("offline");
      vi.mocked(runtime.auth.current).mockReturnValue({
        authGeneration: 1,
        phase,
      });
      const owner = new NativeProductionLifecycleOwner(runtime);
      owner.setAppActive(true);
      owner.setConnectivity("online");
      await settle(owner);
      expect(runtime.auth.refresh).not.toHaveBeenCalled();
    },
  );
});

import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { NativeProductionLifecycleOwner } from "../src/shell/native-production-lifecycle-owner";
import { deriveProductionShellState } from "../src/shell/production-shell-controller";
import { auth, operations, scope } from "./production-shell-test-fixture";

const scopeB = {
  ...scope,
  locationId: "55555555-5555-4555-8555-555555555555",
  locationName: "Amman Annex",
};

function workflow(initialPhase = "inactive") {
  let phase = initialPhase;
  return {
    checkServerState: vi.fn(async () => undefined),
    clear: vi.fn(() => {
      phase = "inactive";
    }),
    current: vi.fn(() => ({ phase, target: null })),
    revalidate: vi.fn(async () => undefined),
    suspendForBackground: vi.fn(),
  };
}

function fixture(responses: EmployeeOperationalSnapshot[]) {
  let snapshot = operations("ready", { retainedScope: scope });
  const advance = async () => {
    snapshot = responses.shift() ?? snapshot;
  };
  const release = workflow("ready");
  const incident = workflow();
  const guestAccess = {
    ...workflow(),
    current: vi.fn(() => ({ mutation: null, target: null })),
    revalidate: vi.fn(async () => undefined),
  };
  const runtime = {
    auth: {
      current: vi.fn(() => auth("authenticated") as NativeAuthSnapshot),
      refresh: vi.fn(async () => "refreshed"),
    },
    connectivity: { current: vi.fn(() => "online") },
    checkIn: workflow(),
    checkInActions: {
      clear: vi.fn(),
      suspendForBackground: vi.fn(),
      reconcile: vi.fn(async () => false),
    },
    confirmParking: workflow(),
    guestAccess,
    handoff: workflow(),
    incident,
    operations: {
      current: vi.fn(() => snapshot),
      refresh: vi.fn(advance),
      setForeground: vi.fn(async (foreground: boolean) => {
        if (foreground) await advance();
      }),
    },
    parking: workflow(),
    release,
    retrieval: workflow(),
    shiftStart: { suspendForBackground: vi.fn() },
    shiftEnd: {
      fenceOperationalScope: vi.fn(),
      setOnline: vi.fn(),
      suspendForBackground: vi.fn(),
    },
    taskTracking: { clear: vi.fn(), setForeground: vi.fn(), setOnline: vi.fn() },
    vehicleDirectory: {
      ...workflow(),
      refresh: vi.fn(async () => undefined),
    },
  } as unknown as NativeEmployeeRuntime;
  return {
    current: () => snapshot,
    guestAccess,
    incident,
    protectedCommand: vi.fn(),
    release,
    runtime,
  };
}

async function settle(owner: NativeProductionLifecycleOwner) {
  await Promise.resolve();
  await owner.whenIdle();
  await Promise.resolve();
  await owner.whenIdle();
}

describe("Native production lifecycle authority", () => {
  it.each([
    ["NETWORK_ERROR", 0],
    ["STAFF_SESSION_SERVICE_UNAVAILABLE", 503],
  ] as const)(
    "preserves active workflow through transient %s and compares later authority",
    async (code, status) => {
      const transient = {
        ...operations("error", { failureCode: code }),
        contextFailure: { code, message: "Temporarily unavailable", status },
      };
      const test = fixture([
        transient,
        operations("ready", { retainedScope: scope }),
        operations("ready", { retainedScope: scopeB }),
      ]);
      const owner = new NativeProductionLifecycleOwner(test.runtime);
      owner.setAppActive(true);
      await settle(owner);

      expect(
        deriveProductionShellState(auth("authenticated"), test.current()),
      ).toMatchObject({ kind: "operational-error", reason: "unavailable" });
      expect(test.release.clear).not.toHaveBeenCalled();
      expect(test.release.current().phase).toBe("ready");
      expect(test.protectedCommand).not.toHaveBeenCalled();

      owner.requestPushAttention();
      await settle(owner);
      expect(test.release.clear).not.toHaveBeenCalled();
      expect(test.release.checkServerState).toHaveBeenCalledOnce();

      owner.requestPushAttention();
      await settle(owner);
      expect(test.release.clear).toHaveBeenCalledOnce();
      expect(test.release.current().phase).toBe("inactive");
      expect(test.protectedCommand).not.toHaveBeenCalled();
    },
  );

  it("retires all workflow material on authoritative denial", async () => {
    const denied = operations("error", {
      failureCode: "AUTHORIZATION_DENIED",
    });
    const test = fixture([denied]);
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(
      deriveProductionShellState(auth("authenticated"), test.current()),
    ).toEqual({ kind: "access-denied" });
    expect(test.release.clear).toHaveBeenCalledOnce();
    expect(test.guestAccess.clear).toHaveBeenCalledOnce();
    expect(test.guestAccess.current().target).toBeNull();
    expect(test.protectedCommand).not.toHaveBeenCalled();
  });

  it("retires scope A immediately when ready scope B becomes authoritative", async () => {
    const test = fixture([operations("ready", { retainedScope: scopeB })]);
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(test.release.clear).toHaveBeenCalledOnce();
    expect(test.release.checkServerState).not.toHaveBeenCalled();
    expect(test.protectedCommand).not.toHaveBeenCalled();
  });

  it("prioritizes visible Guest Access over an underlying workflow", async () => {
    const test = fixture([operations("ready", { retainedScope: scope })]);
    test.guestAccess.current.mockReturnValue({
      target: { sessionId: "s" },
    } as never);
    test.release.current.mockReturnValue({ phase: "inactive" } as never);
    vi.mocked(test.runtime.parking.current).mockReturnValue({
      phase: "accepted",
    } as never);
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(test.guestAccess.revalidate).toHaveBeenCalledOnce();
    expect(test.runtime.parking.checkServerState).not.toHaveBeenCalled();
  });

  it("prioritizes visible Incident over an underlying workflow", async () => {
    const test = fixture([operations("ready", { retainedScope: scope })]);
    test.incident.current.mockReturnValue({
      target: { sessionId: "s" },
    } as never);
    test.release.current.mockReturnValue({ phase: "inactive" } as never);
    vi.mocked(test.runtime.handoff.current).mockReturnValue({
      phase: "ready",
    } as never);
    const owner = new NativeProductionLifecycleOwner(test.runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(test.incident.revalidate).toHaveBeenCalledOnce();
    expect(test.runtime.handoff.checkServerState).not.toHaveBeenCalled();
  });
});

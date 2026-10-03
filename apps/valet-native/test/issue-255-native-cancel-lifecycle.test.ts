import { describe, expect, it, vi } from "vitest";
import { EmployeeCancelCheckInSession } from "@valet/employee-client";
import { NativeCheckInActions } from "../src/check-in/native-check-in-actions";
import { NativeProductionLifecycleOwner } from "../src/shell/native-production-lifecycle-owner";
import type { NativeEmployeeRuntime } from "../src/auth/native-auth-runtime";
import { operations, scope, auth } from "./production-shell-test-fixture";

const detail = {
  sessionId: "target",
  locationId: scope.locationId,
  state: "CHECKING_IN",
  version: 3,
};
function workflow() {
  return {
    current: () => ({ phase: "inactive", target: null }),
    clear: vi.fn(),
    suspendForBackground: vi.fn(),
    checkServerState: vi.fn(),
    revalidate: vi.fn(),
  };
}
async function fixture() {
  let current = operations("ready", { retainedScope: scope });
  const directory = {
    ...workflow(),
    current: () => ({ phase: "ready" }),
    refresh: vi.fn(async () => {}),
  };
  const transport = {
    prepare: vi.fn().mockResolvedValue(detail),
    cancel: vi.fn().mockRejectedValue(new Error("lost response")),
    status: vi
      .fn()
      .mockResolvedValue({ ...detail, state: "CANCELLED", version: 4 }),
  };
  const cancel = new EmployeeCancelCheckInSession(
    transport,
    () => void directory.refresh(),
  );
  const operational = {
    current: () => current,
    refresh: vi.fn(),
    setForeground: vi.fn(),
    clear: vi.fn(),
  };
  const authentication = { current: () => auth("authenticated") };
  const actions = new NativeCheckInActions(
    cancel,
    {} as never,
    directory as never,
    authentication as never,
    operational as never,
    () => true,
  );
  const runtime = {
    auth: authentication,
    operations: operational,
    connectivity: { current: () => "online" },
    checkIn: workflow(),
    checkInActions: actions,
    confirmParking: workflow(),
    guestAccess: workflow(),
    handoff: workflow(),
    incident: workflow(),
    parking: workflow(),
    release: workflow(),
    retrieval: workflow(),
    vehicleDirectory: directory,
    shiftStart: { suspendForBackground: vi.fn() },
    shiftEnd: {
      setOnline: vi.fn(),
      suspendForBackground: vi.fn(),
      fenceOperationalScope: vi.fn(),
    },
  } as unknown as NativeEmployeeRuntime;
  cancel.bind(auth("authenticated").authGeneration, scope);
  await cancel.prepare("target");
  await cancel.confirm();
  return {
    runtime,
    cancel,
    transport,
    directory,
    actions,
    setContext: (value: typeof current) => {
      current = value;
    },
  };
}
async function settle(owner: NativeProductionLifecycleOwner) {
  await Promise.resolve();
  await owner.whenIdle();
  await Promise.resolve();
  await owner.whenIdle();
}
describe("Native cancellation foreground recovery budget", () => {
  it("confirms current authority, reconciles once and refreshes directory once without another POST", async () => {
    const { runtime, cancel, transport, directory } = await fixture();
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(cancel.current().phase).toBe("cancelled");
    expect(transport.status).toHaveBeenCalledOnce();
    expect(transport.cancel).toHaveBeenCalledOnce();
    expect(directory.refresh).toHaveBeenCalledOnce();
    owner.dispose();
  });
  it("losing the active Shift purges unknown intent before any status read", async () => {
    const { runtime, cancel, transport, setContext } = await fixture();
    setContext(operations("no-active-shift"));
    const owner = new NativeProductionLifecycleOwner(runtime);
    owner.setAppActive(true);
    await settle(owner);
    expect(cancel.current().phase).toBe("inactive");
    expect(transport.status).not.toHaveBeenCalled();
    expect(transport.cancel).toHaveBeenCalledOnce();
    owner.dispose();
  });
});

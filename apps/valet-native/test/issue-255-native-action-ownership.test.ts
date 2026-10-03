import { describe, expect, it, vi } from "vitest";
import { NativeCheckInActions } from "../src/check-in/native-check-in-actions";
import { vehicleScope } from "./native-vehicles-test-fixture";

function fixture() {
  let scope = vehicleScope;
  const checkIn = { openExistingCheckIn: vi.fn().mockResolvedValue(true) };
  const directory = { refresh: vi.fn() };
  const cancel = {
    current: () => ({ phase: "inactive" }),
    clear: vi.fn(),
    bind: vi.fn(),
    suspendForBackground: vi.fn(),
    reconcile: vi.fn(),
    prepare: vi.fn(),
    confirm: vi.fn(),
  };
  const actions = new NativeCheckInActions(
    cancel as never,
    checkIn as never,
    directory as never,
    { current: () => ({ phase: "authenticated", authGeneration: 7 }) } as never,
    {
      current: () => ({ phase: "ready", identityGeneration: 7, scope }),
    } as never,
    () => true,
  );
  return {
    actions,
    checkIn,
    directory,
    cancel,
    setScope: (value: typeof scope) => {
      scope = value;
    },
  };
}
describe("Vehicles action adapter ownership and return origin", () => {
  it("enters only after exact hydration and returns to Vehicles with one refresh", async () => {
    const { actions, checkIn, directory } = fixture();
    expect(await actions.continue("selected")).toBe(true);
    expect(checkIn.openExistingCheckIn).toHaveBeenCalledExactlyOnceWith(
      7,
      vehicleScope.locationId,
      `${vehicleScope.organizationId}:${vehicleScope.membershipId}:${vehicleScope.shiftId}:${vehicleScope.role}`,
      "selected",
    );
    expect(actions.returnDestination()).toBe("vehicles");
    expect(directory.refresh).toHaveBeenCalledOnce();
    expect(actions.returnDestination()).toBe("tasks");
    expect(directory.refresh).toHaveBeenCalledOnce();
  });
  it.each(["background", "retirement", "different-scope"])(
    "fences a held exact hydration after %s",
    async (boundary) => {
      const { actions, checkIn, directory, setScope } = fixture();
      let resolve!: (value: boolean) => void;
      checkIn.openExistingCheckIn.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const opening = actions.continue("selected");
      if (boundary === "background") actions.suspendForBackground();
      else if (boundary === "retirement") {
        actions.clear();
        setScope({ ...vehicleScope, shiftId: "B" });
        setScope(vehicleScope);
      } else setScope({ ...vehicleScope, shiftId: "replacement" });
      resolve(true);
      expect(await opening).toBe(false);
      expect(actions.returnDestination()).toBe("tasks");
      expect(directory.refresh).not.toHaveBeenCalled();
    },
  );
  it("does not start cancellation while Continue is pending", async () => {
    const { actions, checkIn, cancel } = fixture();
    let resolve!: (value: boolean) => void;
    checkIn.openExistingCheckIn.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const opening = actions.continue("selected");
    await actions.prepareCancel("other");
    expect(cancel.prepare).not.toHaveBeenCalled();
    resolve(true);
    await opening;
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmployeeVehicleDirectorySession,
  type EmployeeOperationalScope,
  type StaffVehicleDirectoryResponse,
} from "@valet/employee-client";

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(),
    currentState: "active",
  },
}));

const { scheduleVehicleDirectoryRecovery } =
  await import("../src/vehicles/use-native-vehicle-directory-revalidation");

const locationId = "11111111-1111-4111-8111-111111111111";
const scope: EmployeeOperationalScope = {
  locationCode: "AMM",
  locationId,
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-03T08:00:00.000Z",
};

function page(truncated = false): StaffVehicleDirectoryResponse {
  return { locationId, rows: [], truncated };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Native Vehicles reconnect revalidation", () => {
  it("automatically revalidates failed held data after foreground connectivity returns", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page(true));
    const directory = new EmployeeVehicleDirectorySession({
      transport: { load },
    });
    await directory.activate(7, scope);
    await directory.refresh();
    expect(directory.current()).toMatchObject({
      page: { truncated: false },
      phase: "error",
    });

    scheduleVehicleDirectoryRecovery(directory, () => true, 100);
    await vi.advanceTimersByTimeAsync(100);

    expect(load).toHaveBeenCalledTimes(3);
    expect(directory.current()).toMatchObject({
      page: { truncated: true },
      phase: "ready",
    });
  });

  it("does not retry while the application is not foreground", async () => {
    vi.useFakeTimers();
    const directory = {
      current: vi.fn(() => ({ phase: "error" })),
      refresh: vi.fn(),
    };
    scheduleVehicleDirectoryRecovery(directory as never, () => false, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(directory.refresh).not.toHaveBeenCalled();
  });
});

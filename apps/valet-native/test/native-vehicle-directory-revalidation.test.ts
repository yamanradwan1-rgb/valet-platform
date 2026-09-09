import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmployeeApiError,
  EmployeeVehicleDirectorySession,
  employeeNetworkError,
  type EmployeeOperationalScope,
  type StaffVehicleDirectoryResponse,
} from "@valet/employee-client";

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(),
    currentState: "active",
  },
}));

const { scheduleVehicleDirectoryRecovery, shouldAutoRecoverVehicleDirectory } =
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
      .mockRejectedValueOnce(employeeNetworkError())
      .mockResolvedValueOnce(page(true));
    const directory = new EmployeeVehicleDirectorySession({
      transport: { load },
    });
    await directory.activate(7, scope);
    await directory.refresh();
    expect(directory.current()).toMatchObject({
      failure: { code: "NETWORK_ERROR", status: 0 },
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
      current: vi.fn(() => ({
        failure: { code: "NETWORK_ERROR", message: "Offline", status: 0 },
        phase: "error",
      })),
      refresh: vi.fn(),
    };
    scheduleVehicleDirectoryRecovery(directory as never, () => false, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(directory.refresh).not.toHaveBeenCalled();
  });

  it("does not auto-retry a definitive client failure", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(
        new EmployeeApiError({
          code: "VEHICLE_DIRECTORY_FORBIDDEN",
          message: "Forbidden",
          status: 403,
        }),
      );
    const directory = new EmployeeVehicleDirectorySession({
      transport: { load },
    });
    await directory.activate(7, scope);
    await directory.refresh();

    scheduleVehicleDirectoryRecovery(directory, () => true, 100);
    await vi.advanceTimersByTimeAsync(100);

    expect(directory.current()).toMatchObject({
      failure: { code: "VEHICLE_DIRECTORY_FORBIDDEN", status: 403 },
      phase: "error",
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not auto-retry a schema or contract failure", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new Error("Vehicle directory response invalid."));
    const directory = new EmployeeVehicleDirectorySession({
      transport: { load },
    });
    await directory.activate(7, scope);
    await directory.refresh();

    scheduleVehicleDirectoryRecovery(directory, () => true, 100);
    await vi.advanceTimersByTimeAsync(100);

    expect(directory.current()).toMatchObject({
      failure: { code: "OPERATIONAL_STATE_UNAVAILABLE" },
      phase: "error",
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("classifies only the canonical transport network failure for recovery", () => {
    expect(
      shouldAutoRecoverVehicleDirectory({
        code: "NETWORK_ERROR",
        message: "Offline",
        status: 0,
      }),
    ).toBe(true);
    expect(
      shouldAutoRecoverVehicleDirectory({
        code: "NETWORK_ERROR",
        message: "Malformed status",
        status: 503,
      }),
    ).toBe(false);
    expect(
      shouldAutoRecoverVehicleDirectory({
        code: "RATE_LIMITED",
        message: "Retry later",
        retryAfter: 30,
        status: 429,
      }),
    ).toBe(false);
  });
});

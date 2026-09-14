import { describe, expect, it, vi } from "vitest";

import type { StaffVehicleDirectoryResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import {
  VehicleDirectoryLoader,
  initialVehicleDirectoryState,
} from "./vehicles-directory-loader";

const LOCATION_ID = "44444444-4444-4444-8444-444444444444";

function page(
  overrides: Partial<StaffVehicleDirectoryResponse> = {},
): StaffVehicleDirectoryResponse {
  return {
    locationId: LOCATION_ID,
    rows: [
      {
        createdAt: "2026-08-25T09:00:00.000Z",
        keySlotCode: null,
        keySlotVisibility: "UNASSIGNED",
        parkingSpotCode: null,
        parkingZoneCode: null,
        sessionId: "11111111-1111-4111-8111-111111111111",
        state: "AWAITING_PARKING",
        updatedAt: "2026-08-25T09:30:00.000Z",
        vehicle: {
          color: null,
          make: null,
          model: null,
          plateCountry: null,
          plateNumberRaw: "12-34567",
          temporaryDescriptor: "White sedan",
        },
      },
    ],
    truncated: false,
    ...overrides,
  };
}

function clientResolving(payload: unknown): EmployeeApiClient {
  return {
    request: vi.fn().mockResolvedValue(payload),
  } as unknown as EmployeeApiClient;
}

describe("VehicleDirectoryLoader read-model semantics", () => {
  it("starts idle with no fabricated data", () => {
    const loader = new VehicleDirectoryLoader({
      client: clientResolving(page()),
    });
    expect(loader.getState()).toEqual(initialVehicleDirectoryState());
    loader.destroy();
  });

  it("lands a valid authoritative page in the ready state", async () => {
    const loader = new VehicleDirectoryLoader({
      client: clientResolving(page({ truncated: true })),
    });
    await loader.load(LOCATION_ID);
    expect(loader.getState().isLoading).toBe(false);
    expect(loader.getState().error).toBeNull();
    expect(loader.getState().response?.truncated).toBe(true);
    expect(loader.getState().response?.rows).toHaveLength(1);
    loader.destroy();
  });

  it("moves a schema-invalid payload into the error state — never partial rendering", async () => {
    const loader = new VehicleDirectoryLoader({
      client: clientResolving({ locationId: LOCATION_ID, rows: [] }),
    });
    await loader.load(LOCATION_ID);
    expect(loader.getState().error).toBeInstanceOf(Error);
    expect(loader.getState().response).toBeNull();
    expect(loader.getState().isLoading).toBe(false);
    loader.destroy();
  });

  it("rejects a response echoed for another location selector", async () => {
    const otherLocation = "99999999-9999-4999-8999-999999999999";
    const loader = new VehicleDirectoryLoader({
      client: clientResolving(page({ locationId: otherLocation })),
    });
    await loader.load(LOCATION_ID);
    expect(loader.getState().error).toBeInstanceOf(Error);
    expect(loader.getState().response).toBeNull();
    loader.destroy();
  });

  it("surfaces network and API failures as errors without fabricating success", async () => {
    const failingClient = {
      request: vi.fn().mockRejectedValue(
        new EmployeeApiError({
          code: "NETWORK_ERROR",
          isNetworkError: true,
          message: "Network connection unavailable.",
          status: 0,
        }),
      ),
    } as unknown as EmployeeApiClient;
    const loader = new VehicleDirectoryLoader({ client: failingClient });
    await loader.load(LOCATION_ID);
    expect(loader.getState().error).toBeInstanceOf(EmployeeApiError);
    expect(loader.getState().response).toBeNull();
    loader.destroy();
  });

  it("keeps the previously loaded page truthfully visible when a refresh fails", async () => {
    const failingClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(page())
        .mockRejectedValueOnce(new Error("Network dropped")),
    } as unknown as EmployeeApiClient;
    const loader = new VehicleDirectoryLoader({ client: failingClient });
    await loader.load(LOCATION_ID);
    expect(loader.getState().error).toBeNull();

    await loader.load(LOCATION_ID);
    expect(loader.getState().error).toBeInstanceOf(Error);
    // Stale-but-authoritative page stays; no fake offline success is claimed.
    expect(loader.getState().response).not.toBeNull();
    expect(loader.getState().isLoading).toBe(false);
    expect(loader.getState().isRefreshing).toBe(false);
    loader.destroy();
  });

  it("lets only the newest request win when loads overlap", async () => {
    let releaseFirst!: (value: StaffVehicleDirectoryResponse) => void;
    const first = new Promise<StaffVehicleDirectoryResponse>((resolve) => {
      releaseFirst = resolve;
    });
    let requestCount = 0;
    const slowClient = {
      request: vi.fn(() => {
        requestCount += 1;
        if (requestCount === 1) return first;
        return Promise.resolve(
          page({
            rows: [],
            truncated: true,
          }),
        );
      }),
    } as unknown as EmployeeApiClient;

    const onStateChange = vi.fn();
    const loader = new VehicleDirectoryLoader({
      client: slowClient,
      onStateChange,
    });

    const pending = loader.load(LOCATION_ID);
    await loader.load(LOCATION_ID);
    expect(loader.getState().response?.truncated).toBe(true);

    releaseFirst(page({ truncated: false }));
    await pending;
    // The stale first response must never overwrite the newer completed one.
    expect(loader.getState().response?.truncated).toBe(true);
    loader.destroy();
  });
});

describe("VehicleDirectoryLoader StrictMode reset recovery", () => {
  it("recovers after reset: state cleared to non-loading initial and a subsequent load issues a NEW request through the fresh client", async () => {
    let releaseFirst!: (value: StaffVehicleDirectoryResponse) => void;
    const first = new Promise<StaffVehicleDirectoryResponse>((resolve) => {
      releaseFirst = resolve;
    });
    const firstClient = {
      request: vi.fn(() => first),
    } as unknown as EmployeeApiClient;
    const loader = new VehicleDirectoryLoader({ client: firstClient });

    // Mount cycle 1: load goes in-flight.
    const pending = loader.load(LOCATION_ID);
    expect(loader.getState().isLoading).toBe(true);

    // Effect cleanup between StrictMode mount cycles must stay recoverable.
    loader.reset();
    expect(loader.getState()).toEqual(initialVehicleDirectoryState());
    expect(loader.getState().isLoading).toBe(false);

    // Simulated remount binds a fresh client and reloads successfully —
    // reset() must not have poisoned further loads (destroyed stays false).
    const secondClient = {
      request: vi.fn().mockResolvedValue(page({ truncated: true })),
    } as unknown as EmployeeApiClient;
    loader.setClient(secondClient);
    await loader.load(LOCATION_ID);

    expect(secondClient.request).toHaveBeenCalledTimes(1);
    expect(loader.getState().error).toBeNull();
    expect(loader.getState().isLoading).toBe(false);
    expect(loader.getState().response?.truncated).toBe(true);

    releaseFirst(page({ truncated: false }));
    await pending;
    // The aborted pre-reset response arriving late is still ignored.
    expect(loader.getState().response?.truncated).toBe(true);
    loader.destroy();
  });

  it("ignores a first response that arrives after reset (sequence guard intact)", async () => {
    let releaseFirst!: (value: StaffVehicleDirectoryResponse) => void;
    const first = new Promise<StaffVehicleDirectoryResponse>((resolve) => {
      releaseFirst = resolve;
    });
    const onStateChange = vi.fn();
    const loader = new VehicleDirectoryLoader({
      client: { request: vi.fn(() => first) } as unknown as EmployeeApiClient,
      onStateChange,
    });

    const pending = loader.load(LOCATION_ID);
    loader.reset();

    releaseFirst(page());
    await pending;

    // The late pre-reset response must not land in the cleared state.
    expect(loader.getState()).toEqual(initialVehicleDirectoryState());
    loader.destroy();
  });

  it("keeps notifying React state after reset so the remounted cycle observes fresh loads", async () => {
    const onStateChange = vi.fn();
    const loader = new VehicleDirectoryLoader({
      client: clientResolving(page()),
      onStateChange,
    });

    await loader.load(LOCATION_ID);
    const callsBeforeReset = onStateChange.mock.calls.length;

    loader.reset();
    expect(onStateChange.mock.calls.length).toBeGreaterThanOrEqual(
      callsBeforeReset,
    );

    await loader.load(LOCATION_ID);
    // A notification strictly after reset proves the callback stayed attached
    // (the destroy()-style detach would freeze the bound React state).
    expect(onStateChange.mock.calls.length).toBeGreaterThan(callsBeforeReset);
    expect(loader.getState().response).not.toBeNull();
    loader.destroy();
  });
});

import type { StaffVehicleDirectoryResponse } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { fetchStaffVehicleDirectory } from "./vehicles-directory-api";

const LOCATION_ID = "44444444-4444-4444-8444-444444444444";

function row(overrides: Partial<StaffVehicleDirectoryResponse["rows"][number]> = {}) {
  return {
    createdAt: "2026-08-25T09:00:00.000Z",
    keySlotCode: null,
    parkingSpotCode: "B-17",
    parkingZoneCode: "ZB",
    sessionId: "11111111-1111-4111-8111-111111111111",
    state: "PARKED" as const,
    updatedAt: "2026-08-25T09:30:00.000Z",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "87-65432",
      temporaryDescriptor: null,
    },
    ...overrides,
  };
}

describe("fetchStaffVehicleDirectory API (VUI-011C)", () => {
  it("requests the directory endpoint with the locationId param and parses a valid page", async () => {
    const payload: StaffVehicleDirectoryResponse = {
      locationId: LOCATION_ID,
      rows: [row()],
      truncated: false,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchStaffVehicleDirectory(mockClient, LOCATION_ID);

    expect(res).toEqual(payload);
    expect(mockClient.request).toHaveBeenCalledWith(
      "/v1/staff/valet-sessions/directory",
      {
        method: "GET",
        params: { locationId: LOCATION_ID },
        signal: undefined,
        requireAuth: true,
      },
    );
  });

  it("parses an empty page and propagates the truncated flag verbatim", async () => {
    const payload: StaffVehicleDirectoryResponse = {
      locationId: LOCATION_ID,
      rows: [],
      truncated: true,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchStaffVehicleDirectory(mockClient, LOCATION_ID);

    expect(res.rows).toEqual([]);
    expect(res.truncated).toBe(true);
  });

  it("accepts nullable keySlotCode rows (employee fail-closed masking)", async () => {
    const payload: StaffVehicleDirectoryResponse = {
      locationId: LOCATION_ID,
      rows: [
        row({ keySlotCode: null }),
        row({
          keySlotCode: "K-07",
          sessionId: "22222222-2222-4222-8222-222222222222",
        }),
      ],
      truncated: false,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchStaffVehicleDirectory(mockClient, LOCATION_ID);

    expect(res.rows[0]?.keySlotCode).toBeNull();
    expect(res.rows[1]?.keySlotCode).toBe("K-07");
  });

  it.each([
    {
      name: "missing truncated flag",
      payload: { locationId: LOCATION_ID, rows: [] },
    },
    {
      name: "unknown extra key (strict contract)",
      payload: {
        extra: true,
        locationId: LOCATION_ID,
        rows: [],
        truncated: false,
      },
    },
    {
      name: "COMPLETED lifecycle row leaking past the server filter",
      payload: {
        locationId: LOCATION_ID,
        // Deliberate contract violation: COMPLETED must never appear.
        rows: [{ ...row(), state: "COMPLETED" }],
        truncated: false,
      },
    },
    {
      name: "non-uuid sessionId",
      payload: {
        locationId: LOCATION_ID,
        rows: [row({ sessionId: "not-a-uuid" })],
        truncated: false,
      },
    },
  ])("rejects schema-invalid payloads ($name) instead of partial rendering", async ({
    payload,
  }) => {
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    await expect(
      fetchStaffVehicleDirectory(mockClient, LOCATION_ID),
    ).rejects.toThrow();
    expect(mockClient.request).toHaveBeenCalledTimes(1);
  });
});

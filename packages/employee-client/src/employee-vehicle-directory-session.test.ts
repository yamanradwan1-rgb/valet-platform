import { describe, expect, it, vi } from "vitest";
import type { StaffVehicleDirectoryResponse } from "@valet/contracts";

import { EmployeeVehicleDirectorySession } from "./employee-vehicle-directory-session";
import { createEmployeeVehicleDirectoryTransport } from "./employee-vehicle-directory-transport";
import type { EmployeeOperationalScope } from "./employee-operational-types";

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

function page(overrides: Partial<StaffVehicleDirectoryResponse> = {}) {
  return {
    locationId,
    rows: [],
    truncated: false,
    ...overrides,
  } satisfies StaffVehicleDirectoryResponse;
}

describe("Employee vehicle directory", () => {
  it("uses the authenticated Staff endpoint and strict shared schema", async () => {
    const request = vi.fn().mockResolvedValue(page());
    const transport = createEmployeeVehicleDirectoryTransport(
      () => ({ request }) as never,
    );
    await expect(transport.load(locationId)).resolves.toEqual(page());
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      params: { locationId },
      path: "/v1/staff/valet-sessions/directory",
    });
    request.mockResolvedValue({
      locationId,
      rows: [],
      truncated: false,
      extra: true,
    });
    await expect(transport.load(locationId)).rejects.toThrow();
  });

  it("preserves the authoritative restricted Key Slot distinction", async () => {
    const restrictedPage: StaffVehicleDirectoryResponse = page({
      rows: [
        {
          createdAt: "2026-09-03T08:00:00.000Z",
          keySlotCode: null,
          keySlotVisibility: "RESTRICTED",
          parkingSpotCode: "P-03",
          parkingZoneCode: "North",
          sessionId: "55555555-5555-4555-8555-555555555555",
          state: "PARKED",
          updatedAt: "2026-09-03T09:00:00.000Z",
          vehicle: {
            color: null,
            make: "Toyota",
            model: "Camry",
            plateCountry: null,
            plateNumberRaw: null,
            temporaryDescriptor: null,
          },
        },
      ],
    });
    const transport = createEmployeeVehicleDirectoryTransport(
      () => ({ request: vi.fn().mockResolvedValue(restrictedPage) }) as never,
    );

    const loaded = await transport.load(locationId);

    expect(loaded.rows[0]).toMatchObject({
      keySlotCode: null,
      keySlotVisibility: "RESTRICTED",
    });
  });

  it("retains same-authority data during refresh and fails closed initially", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(page({ truncated: true }))
      .mockRejectedValueOnce(new Error("offline"));
    const session = new EmployeeVehicleDirectorySession({
      transport: { load },
    });
    await session.activate(7, scope);
    expect(session.current()).toMatchObject({
      phase: "ready",
      page: { truncated: true },
    });
    const pending = session.refresh();
    expect(session.current()).toMatchObject({
      phase: "refreshing",
      page: { truncated: true },
    });
    await pending;
    expect(session.current()).toMatchObject({
      phase: "error",
      page: { truncated: true },
    });

    const fresh = new EmployeeVehicleDirectorySession({
      transport: { load: vi.fn().mockRejectedValue(new Error("invalid")) },
    });
    await fresh.activate(7, scope);
    expect(fresh.current()).toMatchObject({ phase: "error", page: null });
  });

  it("clears old rows before a new authority can load", async () => {
    let resolveNext!: (value: StaffVehicleDirectoryResponse) => void;
    const next = new Promise<StaffVehicleDirectoryResponse>((resolve) => {
      resolveNext = resolve;
    });
    const load = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockReturnValueOnce(next);
    const session = new EmployeeVehicleDirectorySession({
      transport: { load },
    });
    await session.activate(7, scope);
    const changed = {
      ...scope,
      locationId: "99999999-9999-4999-8999-999999999999",
      shiftId: "88888888-8888-4888-8888-888888888888",
    };
    const pending = session.activate(8, changed);
    expect(session.current()).toMatchObject({
      identityGeneration: 8,
      page: null,
      phase: "loading",
    });
    resolveNext(page({ locationId: changed.locationId }));
    await pending;
    expect(session.current().page?.locationId).toBe(changed.locationId);
  });
});

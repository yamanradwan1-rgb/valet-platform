import { describe, expect, it, vi } from "vitest";
import { createEmployeeVehicleDirectoryTransport } from "./employee-vehicle-directory-transport";

const locationId = "11111111-1111-4111-8111-111111111111";
describe("Native opt-in directory capability", () => {
  it("negotiates v2 deliberately and rejects a v1 response without silently inventing action authority", async () => {
    const request = vi.fn().mockResolvedValue({
      locationId,
      rows: [
        {
          sessionId: "22222222-2222-4222-8222-222222222222",
          state: "CHECKING_IN",
          createdAt: "2026-10-03T00:00:00.000Z",
          updatedAt: "2026-10-03T00:00:00.000Z",
          vehicle: {
            make: null,
            model: null,
            color: null,
            plateCountry: null,
            plateNumberRaw: null,
            temporaryDescriptor: "Vehicle",
          },
          keySlotCode: null,
          keySlotVisibility: "UNASSIGNED",
          parkingSpotCode: null,
          parkingZoneCode: null,
          canContinueCheckIn: true,
          canCancelCheckIn: true,
        },
      ],
      truncated: false,
    });
    const transport = createEmployeeVehicleDirectoryTransport(
      () => ({ request }) as never,
      { checkInActions: true },
    );
    expect((await transport.load(locationId)).rows[0]).toHaveProperty(
      "canContinueCheckIn",
      true,
    );
    expect(request.mock.calls[0]?.[0].headers).toEqual({
      "Valet-Vehicle-Directory-Capability": "check-in-actions-v2",
    });
    const row = (await request()).rows[0]!;
    const legacy = { ...row };
    delete legacy.canContinueCheckIn;
    delete legacy.canCancelCheckIn;
    request.mockResolvedValue({ locationId, rows: [legacy], truncated: false });
    await expect(transport.load(locationId)).rejects.toThrow();
  });
});

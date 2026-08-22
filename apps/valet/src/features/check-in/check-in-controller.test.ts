import { describe, expect, it, vi } from "vitest";
import type {
  StaffCheckInContinuationsResponse,
  StaffCheckInDraftsResponse,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";

describe("CheckInController Discovery & Hydration", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const vehicleId = "44444444-4444-4444-8444-444444444444";

  it("initializes to plate-scan when 0 recoverable drafts exist", async () => {
    const emptyDrafts: StaffCheckInDraftsResponse = { drafts: [] };
    const emptyContinuations: StaffCheckInContinuationsResponse = {
      continuations: [],
    };
    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(emptyDrafts)
        .mockResolvedValueOnce(emptyContinuations),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.initialize(locationId);

    expect(controller.getState().step).toBe("plate-scan");
    expect(controller.getState().activeSession).toBeNull();
  });

  it("resumes single draft (A2) and hydrates via A1 to vehicle-condition step", async () => {
    const draftsRes: StaffCheckInDraftsResponse = {
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: "2026-08-21T18:00:00.000Z",
          sessionId,
          vehicle: {
            color: "Black",
            make: "Porsche",
            model: "Taycan",
            plateCountry: "JO",
            plateNumberRaw: "12-34567",
            temporaryDescriptor: null,
          },
        },
      ],
    };
    const detailRes: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: null },
      handoff: { pendingAt: null, verification: null },
      keySlot: null,
      locationId,
      parking: { parkedAt: null, parkingSpotCode: null, parkingStartedAt: null, parkingZoneCode: null },
      sessionId,
      state: "CHECKING_IN",
      vehicle: {
        color: "Black",
        make: "Porsche",
        model: "Taycan",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId,
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 1,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(draftsRes)
        .mockResolvedValueOnce({ continuations: [] })
        .mockResolvedValueOnce(detailRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.initialize(locationId);

    expect(controller.getState().step).toBe("vehicle-condition");
    expect(controller.getState().activeSession?.state).toBe("CHECKING_IN");
  });

  it("uses A1 state authoritatively when discovery draft advanced to AWAITING_PARKING", async () => {
    const draftsRes: StaffCheckInDraftsResponse = {
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: "2026-08-21T18:00:00.000Z",
          sessionId,
          vehicle: { color: "Black", make: "BMW", model: "X5", plateCountry: "JO", plateNumberRaw: "12-34567", temporaryDescriptor: null },
        },
      ],
    };
    const detailRes: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:02:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      keySlot: { code: "B-214" },
      locationId,
      parking: { parkedAt: null, parkingSpotCode: null, parkingStartedAt: null, parkingZoneCode: null },
      sessionId,
      state: "AWAITING_PARKING",
      vehicle: { color: "Black", make: "BMW", model: "X5", plateCountry: "JO", plateNumberRaw: "12-34567", temporaryDescriptor: null, vehicleId, vehicleUpdatedAt: "2026-08-21T18:00:00.000Z" },
      version: 3,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(draftsRes)
        .mockResolvedValueOnce({ continuations: [] })
        .mockResolvedValueOnce(detailRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.initialize(locationId);

    expect(controller.getState().step).toBe("parking-task");
    expect(controller.getState().activeSession?.state).toBe("AWAITING_PARKING");
  });

  it("fails closed to hydration-error when A1 AWAITING_PARKING lacks conditionCompletedAt", async () => {
    const detailRes: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: null },
      handoff: { pendingAt: null, verification: null },
      keySlot: null,
      locationId,
      parking: { parkedAt: null, parkingSpotCode: null, parkingStartedAt: null, parkingZoneCode: null },
      sessionId,
      state: "AWAITING_PARKING",
      vehicle: { color: "Black", make: "BMW", model: "X5", plateCountry: "JO", plateNumberRaw: "12-34567", temporaryDescriptor: null, vehicleId, vehicleUpdatedAt: "2026-08-21T18:00:00.000Z" },
      version: 2,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(detailRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.hydrateFromContinuation(locationId, {
      createdAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      vehicle: detailRes.vehicle,
    });

    expect(controller.getState().step).toBe("hydration-error");
    expect(controller.getState().error).toContain("missing authoritative conditionCompletedAt");
  });

  it("fails closed when A1 shows session advanced beyond check-in lifecycle (e.g. PARKED)", async () => {
    const detailRes: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:02:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      keySlot: { code: "K-1" },
      locationId,
      parking: { parkedAt: "2026-08-21T18:05:00.000Z", parkingSpotCode: "P-101", parkingStartedAt: "2026-08-21T18:03:00.000Z", parkingZoneCode: "North" },
      sessionId,
      state: "PARKED",
      vehicle: { color: "Black", make: "BMW", model: "X5", plateCountry: "JO", plateNumberRaw: "12-34567", temporaryDescriptor: null, vehicleId, vehicleUpdatedAt: "2026-08-21T18:00:00.000Z" },
      version: 4,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(detailRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.hydrateFromDraft(locationId, {
      conditionCompletedAt: null,
      createdAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      vehicle: detailRes.vehicle,
    });

    expect(controller.getState().step).toBe("hydration-error");
    expect(controller.getState().error).toContain("Session has advanced to state PARKED");
  });
});

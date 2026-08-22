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

    const onStateChange = vi.fn();
    const controller = new CheckInController(mockClient, onStateChange);

    await controller.initialize(locationId);

    expect(controller.getState().step).toBe("plate-scan");
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().isHydrating).toBe(false);
  });

  it("resumes single draft (A2) and hydrates via A1", async () => {
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
    const continuationsRes: StaffCheckInContinuationsResponse = {
      continuations: [],
    };
    const detailRes: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: null },
      keySlot: null,
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "CHECKING_IN",
      vehicle: {
        color: "Black",
        make: "Porsche",
        model: "Taycan",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 1,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(draftsRes)
        .mockResolvedValueOnce(continuationsRes)
        .mockResolvedValueOnce(detailRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.initialize(locationId);

    const state = controller.getState();
    expect(state.step).toBe("customer-phone");
    expect(state.activeSession?.sessionId).toBe(sessionId);
    expect(state.activeSession?.vehicle.make).toBe("Porsche");
    expect(state.activeSession?.vehicle.model).toBe("Taycan");
    expect(state.activeSession?.state).toBe("CHECKING_IN");
  });

  it("resumes single continuation (A3) with assigned key slot to parking-task step", async () => {
    const draftsRes: StaffCheckInDraftsResponse = { drafts: [] };
    const continuationsRes: StaffCheckInContinuationsResponse = {
      continuations: [
        {
          createdAt: "2026-08-21T18:00:00.000Z",
          sessionId,
          vehicle: {
            color: "White",
            make: "BMW",
            model: "X5",
            plateCountry: "JO",
            plateNumberRaw: "99-12345",
            temporaryDescriptor: null,
          },
        },
      ],
    };
    const detailRes: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:02:00.000Z" },
      keySlot: { code: "B-214" },
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "AWAITING_PARKING",
      vehicle: {
        color: "White",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "99-12345",
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 3,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(draftsRes)
        .mockResolvedValueOnce(continuationsRes)
        .mockResolvedValueOnce(detailRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.initialize(locationId);

    const state = controller.getState();
    expect(state.step).toBe("parking-task");
    expect(state.activeSession?.keySlotCode).toBe("B-214");
    expect(state.activeSession?.state).toBe("AWAITING_PARKING");
  });

  it("sets multiple-recoverable step when 2+ recoverable items exist", async () => {
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
    const continuationsRes: StaffCheckInContinuationsResponse = {
      continuations: [
        {
          createdAt: "2026-08-21T18:01:00.000Z",
          sessionId: "99999999-9999-4999-8999-999999999999",
          vehicle: {
            color: "White",
            make: "BMW",
            model: "X5",
            plateCountry: "JO",
            plateNumberRaw: "99-12345",
            temporaryDescriptor: null,
          },
        },
      ],
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(draftsRes)
        .mockResolvedValueOnce(continuationsRes),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.initialize(locationId);

    expect(controller.getState().step).toBe("multiple-recoverable");
    expect(controller.getState().drafts).toHaveLength(1);
    expect(controller.getState().continuations).toHaveLength(1);
  });
});

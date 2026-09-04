import { describe, expect, it, vi } from "vitest";

import {
  EmployeeClient,
  type EmployeeTransportRequest,
} from "./employee-client";
import { createEmployeeCheckInTransport } from "./employee-check-in-transport";

const locationId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

describe("Employee Check-In transport", () => {
  it("uses only the accepted staff Check-In endpoints", async () => {
    const requests: EmployeeTransportRequest[] = [];
    const client = new EmployeeClient({
      transport: {
        execute: vi.fn(async (request) => {
          requests.push(request);
          if (request.path.endsWith("/drafts"))
            return { payload: { drafts: [] }, status: 200 };
          if (request.path.endsWith("/continuations"))
            return { payload: { continuations: [] }, status: 200 };
          return { payload: { vehicle: null }, status: 200 };
        }),
      },
    });
    const transport = createEmployeeCheckInTransport(client);
    await transport.loadDrafts(locationId);
    await transport.loadContinuations(locationId);
    await transport.recognize({
      targetLocationId: locationId,
      vehicleIdentity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
      },
    });
    expect(requests).toEqual([
      {
        method: "GET",
        params: { locationId },
        path: "/v1/staff/check-in/drafts",
      },
      {
        method: "GET",
        params: { locationId },
        path: "/v1/staff/check-in/continuations",
      },
      expect.objectContaining({
        method: "POST",
        path: "/v1/staff/check-in/vehicle-recognition",
      }),
    ]);
  });

  it("creates a fresh authenticated client for later identity generations", async () => {
    const first = new EmployeeClient({
      transport: {
        execute: vi
          .fn()
          .mockResolvedValue({ payload: { drafts: [] }, status: 200 }),
      },
    });
    const second = new EmployeeClient({
      transport: {
        execute: vi
          .fn()
          .mockResolvedValue({ payload: { drafts: [] }, status: 200 }),
      },
    });
    const factory = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const transport = createEmployeeCheckInTransport(factory);
    await transport.loadDrafts(locationId);
    await transport.loadDrafts(locationId);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("does not rewrite the authoritative session identity", async () => {
    const execute = vi.fn().mockResolvedValue({
      payload: {
        checkIn: { conditionCompletedAt: null },
        guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
        handoff: { pendingAt: null, verification: null },
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
          color: null,
          make: null,
          model: null,
          plateCountry: "JO",
          plateNumberRaw: "12-34567",
          temporaryDescriptor: null,
          vehicleId: "33333333-3333-4333-8333-333333333333",
          vehicleUpdatedAt: "2026-09-04T08:00:00.000Z",
        },
        version: 1,
      },
      status: 200,
    });
    const transport = createEmployeeCheckInTransport(
      new EmployeeClient({ transport: { execute } }),
    );
    const result = await transport.loadSession(sessionId);
    expect(result.sessionId).toBe(sessionId);
    expect(execute).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/staff/valet-sessions/${sessionId}`,
    });
  });
});

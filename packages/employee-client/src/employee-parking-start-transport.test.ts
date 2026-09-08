import { describe, expect, it, vi } from "vitest";

import type { EmployeeClient } from "./employee-client";
import { createEmployeeParkingStartTransport } from "./employee-parking-start-transport";
import { ids, parkingTask } from "./employee-operational-test-fixture";

const detail = {
  checkIn: { conditionCompletedAt: "2026-09-07T08:00:00.000Z" },
  guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
  handoff: { pendingAt: null, verification: null },
  keySlot: null,
  locationId: ids.location,
  parking: {
    parkedAt: null,
    parkingSpotCode: null,
    parkingStartedAt: null,
    parkingZoneCode: null,
  },
  sessionId: ids.session,
  state: "AWAITING_PARKING",
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
    vehicleId: "77777777-7777-4777-8777-777777777777",
    vehicleUpdatedAt: "2026-09-07T08:00:00.000Z",
  },
  version: 2,
};

describe("Employee Parking Start transport", () => {
  it("uses the accepted reads, queue command, and exact Start Parking body", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ tasks: [parkingTask()] })
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({
        createdAt: "2026-09-07T08:00:00.000Z",
        currentAssigneeMembershipId: ids.membership,
        sessionId: ids.session,
        status: "ACCEPTED",
        taskId: ids.task,
        taskType: "PARKING",
        version: 3,
      })
      .mockResolvedValueOnce({
        parkingStartedAt: "2026-09-07T08:05:00.000Z",
        sessionId: ids.session,
        sessionVersion: 3,
        state: "PARKING",
        taskId: ids.task,
        taskStatus: "IN_PROGRESS",
        taskVersion: 4,
      });
    const transport = createEmployeeParkingStartTransport({
      request,
    } as unknown as EmployeeClient);

    await transport.loadTaskQueue(ids.location);
    await transport.loadSession(ids.session);
    await transport.queueParkingTask(ids.session);
    await transport.startParking(ids.session, 2, 3);

    expect(request.mock.calls).toEqual([
      [
        {
          method: "GET",
          params: { locationId: ids.location },
          path: "/v1/staff/tasks/queue",
        },
      ],
      [{ method: "GET", path: `/v1/staff/valet-sessions/${ids.session}` }],
      [
        {
          body: {},
          method: "POST",
          path: `/v1/staff/valet-sessions/${ids.session}/parking-task/queue`,
        },
      ],
      [
        {
          body: { expectedSessionVersion: 2, expectedTaskVersion: 3 },
          method: "POST",
          path: `/v1/staff/valet-sessions/${ids.session}/start-parking`,
        },
      ],
    ]);
  });
});

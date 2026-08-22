import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

describe("Staff Valet Session Requested Retrieval Authorization Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  it("denies unrelated on-shift employee when retrieval is QUEUED and preserves parking owner access", async () => {
    const { fixture } = await harness.fixtureWithToken();

    const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenA = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenA}`, employeeA.userId);

    const employeeC = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, employeeC.userId);

    const zoneId = await harness.createParkingZone(fixture, "ZONE-RQ");
    const spotId = await harness.createParkingSpot(fixture, zoneId, "RQ-1");
    const slotId = await harness.createKeySlot(fixture, "K-RQ");

    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: spotId,
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "REQUESTED",
      version: 4,
    });

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeA.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: null,
      status: "QUEUED",
      taskType: "RETRIEVAL",
    });

    const resC = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(resC.status).toBe(404);
    expect(resC.body.code).toBe("TENANT_ACCESS_DENIED");

    const resA = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenA },
    );
    expect(resA.status).toBe(200);
    expect(resA.body.state).toBe("REQUESTED");
    expect(resA.body.parking.parkingSpotCode).toBe("RQ-1");
  });

  it("allows accepted retrieval owner to read while unrelated same-location peer is denied", async () => {
    const { fixture } = await harness.fixtureWithToken();

    const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenB = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

    const employeeC = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, employeeC.userId);

    const zoneId = await harness.createParkingZone(fixture, "ZONE-RA");
    const spotId = await harness.createParkingSpot(fixture, zoneId, "RA-2");
    const slotId = await harness.createKeySlot(fixture, "K-RA");

    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: spotId,
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "REQUESTED",
      version: 4,
    });

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: fixture.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeB.membershipId,
      status: "ACCEPTED",
      taskType: "RETRIEVAL",
    });

    const resB = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(resB.status).toBe(200);
    expect(resB.body.state).toBe("REQUESTED");
    expect(resB.body.parking.parkingSpotCode).toBe("RA-2");
    expect(resB.body.keySlot?.code).toBe("K-RA");

    const resC = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(resC.status).toBe(404);
    expect(resC.body.code).toBe("TENANT_ACCESS_DENIED");
  });
});

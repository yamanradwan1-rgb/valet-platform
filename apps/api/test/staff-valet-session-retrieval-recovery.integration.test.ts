import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

describe("Staff Valet Session Retrieval Recovery Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  it("authorizes retrieval assignee to read REQUESTED session and denies unrelated peer", async () => {
    const { fixture } = await harness.fixtureWithToken();

    // Employee A parked the vehicle
    const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);

    // Employee B owns the accepted retrieval task
    const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenB = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

    // Employee C is an unrelated on-shift valet employee
    const employeeC = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, employeeC.userId);

    const zoneId = await harness.createParkingZone(fixture, "ZONE-R");
    const spotId = await harness.createParkingSpot(fixture, zoneId, "R-10");
    const slotId = await harness.createKeySlot(fixture, "K-88");
    const vehicleId = await harness.createVehicle(fixture, {
      make: "Audi",
      model: "A6",
      plateCountry: "JO",
      plateNumberRaw: "77-99999",
    });

    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: spotId,
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "REQUESTED",
      vehicleId,
      version: 4,
    });

    // Completed parking task owned by Employee A
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeA.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });

    // Accepted retrieval task owned by Employee B
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeB.membershipId,
      status: "ACCEPTED",
      taskType: "RETRIEVAL",
    });

    // Employee B should successfully read the session
    const resB = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(resB.status).toBe(200);
    expect(resB.body.sessionId).toBe(sessionId);
    expect(resB.body.state).toBe("REQUESTED");
    expect(resB.body.parking.parkingSpotCode).toBe("R-10");
    expect(resB.body.parking.parkingZoneCode).toBe("ZONE-R");
    expect(resB.body.keySlot?.code).toBe("K-88");

    // Unrelated Employee C must be denied
    const resC = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(resC.status).toBe(404);
    expect(resC.body.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("authorizes retrieval assignee to read RETRIEVING session with released parking spot", async () => {
    const { fixture } = await harness.fixtureWithToken();
    const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenB = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

    const employeeC = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, employeeC.userId);

    const zoneId = await harness.createParkingZone(fixture, "ZONE-R2");
    const slotId = await harness.createKeySlot(fixture, "K-99");
    const vehicleId = await harness.createVehicle(fixture, {
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
    });

    // In RETRIEVING state, parking_spot_id is released (NULL)
    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: null,
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "RETRIEVING",
      vehicleId,
      version: 5,
    });

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeA.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeB.membershipId,
      status: "IN_PROGRESS",
      taskType: "RETRIEVAL",
    });

    const resB = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(resB.status).toBe(200);
    expect(resB.body.sessionId).toBe(sessionId);
    expect(resB.body.state).toBe("RETRIEVING");
    expect(resB.body.parking.parkingSpotCode).toBeNull();
    expect(resB.body.parking.parkingZoneCode).toBeNull();
    expect(resB.body.keySlot?.code).toBe("K-99");

    const resC = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(resC.status).toBe(404);
    expect(resC.body.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("authorizes retrieval assignee to read READY session while task is IN_PROGRESS", async () => {
    const { fixture } = await harness.fixtureWithToken();
    const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenB = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

    const employeeC = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, employeeC.userId);

    const slotId = await harness.createKeySlot(fixture, "K-100");
    const vehicleId = await harness.createVehicle(fixture, {
      make: "Porsche",
      model: "Taycan",
      plateCountry: "JO",
      plateNumberRaw: "99-12345",
    });

    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: null,
      parkingStartedAt: new Date(),
      parkingZoneId: null,
      state: "READY",
      vehicleId,
      version: 6,
    });

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeA.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeB.membershipId,
      status: "IN_PROGRESS",
      taskType: "RETRIEVAL",
    });

    const resB = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(resB.status).toBe(200);
    expect(resB.body.sessionId).toBe(sessionId);
    expect(resB.body.state).toBe("READY");
    expect(resB.body.parking.parkingSpotCode).toBeNull();

    const resC = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(resC.status).toBe(404);
  });
});

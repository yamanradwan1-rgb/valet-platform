import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

describe("Staff Valet Session Projection and Invariants Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  describe("Detail Projection", () => {
    it("projects confirmed plate, key slot, and parking details with no PII", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const zoneId = await harness.createParkingZone(fixture, "ZONE-B");
      const spotId = await harness.createParkingSpot(fixture, zoneId, "B-17");
      const slotId = await harness.createKeySlot(fixture, "B-214", "ACTIVE");
      const vehicleId = await harness.createVehicle(fixture, {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
      });

      const { sessionId } = await harness.createSession(fixture, {
        checkInConditionCompletedAt: new Date("2026-08-21T18:00:00.000Z"),
        keySlotId: slotId,
        parkedAt: new Date("2026-08-21T18:05:00.000Z"),
        parkingSpotId: spotId,
        parkingStartedAt: new Date("2026-08-21T18:02:00.000Z"),
        parkingZoneId: zoneId,
        state: "PARKED",
        vehicleId,
        version: 5,
      });

      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "COMPLETED",
      });

      const res = await harness.request<StaffValetSessionDetailResponse>(
        "GET",
        `/v1/staff/valet-sessions/${sessionId}`,
        {
          token,
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.state).toBe("PARKED");
      expect(res.body.version).toBe(5);
      expect(res.body.vehicle.make).toBe("BMW");
      expect(res.body.vehicle.model).toBe("X5");
      expect(res.body.vehicle.color).toBe("Black");
      expect(res.body.vehicle.plateCountry).toBe("JO");
      expect(res.body.vehicle.plateNumberRaw).toBe("12-34567");
      expect(typeof res.body.vehicle.vehicleUpdatedAt).toBe("string");
      expect(res.body.keySlot?.code).toBe("B-214");
      expect(res.body.parking.parkingSpotCode).toBe("B-17");
      expect(res.body.parking.parkingZoneCode).toBe("ZONE-B");
      expect(res.body.parking.parkingStartedAt).toBe("2026-08-21T18:02:00.000Z");
      expect(res.body.parking.parkedAt).toBe("2026-08-21T18:05:00.000Z");
      expect(res.body.checkIn.conditionCompletedAt).toBe("2026-08-21T18:00:00.000Z");

      // Verify strict exclusion of customer PII and internal secrets
      const rawBody = res.body as unknown as Record<string, unknown>;
      expect(rawBody.customerPhone).toBeUndefined();
      expect(rawBody.customerName).toBeUndefined();
      expect(rawBody.customerAccessToken).toBeUndefined();
      expect(rawBody.gps).toBeUndefined();
    });

    it("projects now-INACTIVE key slot successfully as valid historical state", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const slotId = await harness.createKeySlot(fixture, "INACT-99", "INACTIVE");
      const { sessionId } = await harness.createSession(fixture, {
        keySlotId: slotId,
        state: "AWAITING_PARKING",
      });

      const res = await harness.request<StaffValetSessionDetailResponse>(
        "GET",
        `/v1/staff/valet-sessions/${sessionId}`,
        {
          token,
        },
      );
      expect(res.status).toBe(200);
      expect(res.body.keySlot?.code).toBe("INACT-99");
    });

    it("projects persisted Zone when Parking Spot is intentionally absent", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const zoneId = await harness.createParkingZone(fixture, "ZONE-ONLY");
      const { sessionId } = await harness.createSession(fixture, {
        parkedAt: new Date("2026-08-21T18:05:00.000Z"),
        parkingStartedAt: new Date("2026-08-21T18:02:00.000Z"),
        parkingZoneId: zoneId,
        state: "PARKED",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "COMPLETED",
      });
      const res = await harness.request<StaffValetSessionDetailResponse>(
        "GET",
        "/v1/staff/valet-sessions/" + sessionId,
        { token },
      );
      expect(res.status).toBe(200);
      expect(res.body.parking.parkingSpotCode).toBeNull();
      expect(res.body.parking.parkingZoneCode).toBe("ZONE-ONLY");
    });
  });

  describe("Corruption and Invariant Validation", () => {
    it("fails closed when post-check-in session has missing condition completion", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        checkInConditionCompletedAt: null,
        state: "AWAITING_PARKING",
      });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(500);
    });

    it("fails closed when PARKING session has missing parkingStartedAt", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        parkingStartedAt: null,
        state: "PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "IN_PROGRESS",
      });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(500);
    });

    it("fails closed when post-parking session has 0 completed parking tasks", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const zoneId = await harness.createParkingZone(fixture, "ZONE-C");
      const spotId = await harness.createParkingSpot(fixture, zoneId, "C-1");
      const { sessionId } = await harness.createSession(fixture, {
        parkedAt: new Date(),
        parkingSpotId: spotId,
        parkingStartedAt: new Date(),
        parkingZoneId: zoneId,
        state: "PARKED",
      });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(500);
    });

    it("fails closed when post-parking session has duplicate completed parking tasks", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const zoneId = await harness.createParkingZone(fixture, "ZONE-D");
      const spotId = await harness.createParkingSpot(fixture, zoneId, "D-1");
      const { sessionId } = await harness.createSession(fixture, {
        parkedAt: new Date(),
        parkingSpotId: spotId,
        parkingStartedAt: new Date(),
        parkingZoneId: zoneId,
        state: "PARKED",
      });

      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "COMPLETED",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "COMPLETED",
      });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(500);
    });

    it("fails closed when post-parking session is missing parking spot and zone", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const zoneA = await harness.createParkingZone(fixture, "ZONE-A");
      const spotA = await harness.createParkingSpot(fixture, zoneA, "A-1");

      const { sessionId } = await harness.createSession(fixture, {
        parkedAt: new Date(),
        parkingSpotId: spotA,
        parkingStartedAt: new Date(),
        parkingZoneId: zoneA,
        state: "PARKED",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "COMPLETED",
      });

      // Clear parking_spot_id and parking_zone_id on session to simulate corrupted post-parking state
      await harness.context.adminPool.query(
        "UPDATE valet_sessions SET parking_spot_id = NULL, parking_zone_id = NULL WHERE id = $1",
        [sessionId],
      );

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(500);
    });
  });

  describe("TOCTOU Authorization Race Concurrency", () => {
    it("ensures concurrent QUEUED -> ASSIGNED mutation blocks stale reads", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const tokenB = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

      const { sessionId } = await harness.createSession(fixture, { state: "AWAITING_PARKING" });
      const taskId = await harness.createTask(fixture, sessionId, { status: "QUEUED" });

      // Transaction 1: Assign task to Employee A with explicit FOR UPDATE lock
      const assignTx = await harness.context.adminPool.connect();
      await assignTx.query("BEGIN");
      await assignTx.query("SELECT * FROM tasks WHERE id = $1 FOR UPDATE", [taskId]);
      await assignTx.query(
        "UPDATE tasks SET status = 'ASSIGNED', current_assignee_membership_id = $1 WHERE id = $2",
        [employeeA.membershipId, taskId],
      );

      // Start Employee B's read in parallel (which will wait on the lock for tasks)
      const readPromise = harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenB,
      });

      // Brief pause then commit assignment
      await new Promise((r) => setTimeout(r, 50));
      await assignTx.query("COMMIT");
      assignTx.release();

      const readRes = await readPromise;
      // Because assignment committed first, Employee B must see ASSIGNED and be rejected with 404
      expect(readRes.status).toBe(404);
      expect(readRes.body.code).toBe("TENANT_ACCESS_DENIED");
    });
  });
});

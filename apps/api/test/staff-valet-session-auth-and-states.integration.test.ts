import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

describe("Staff Valet Session Auth and States Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  describe("Authentication and Base Authorization", () => {
    it("rejects request with no token with 401", async () => {
      const res = await harness.request("GET", `/v1/staff/valet-sessions/${randomUUID()}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("STAFF_AUTHENTICATION_REQUIRED");
    });

    it("rejects request with invalid UUID format with 400", async () => {
      const { token } = await harness.fixtureWithToken();
      const res = await harness.request("GET", "/v1/staff/valet-sessions/not-a-uuid", {
        token,
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("REQUEST_INVALID");
    });

    it("returns non-disclosing 404 for nonexistent session", async () => {
      const { token } = await harness.fixtureWithToken();
      const res = await harness.request("GET", `/v1/staff/valet-sessions/${randomUUID()}`, {
        token,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
    });

    it("rejects cross-organization session lookup with 404", async () => {
      const { fixture: fixtureA } = await harness.fixtureWithToken();
      const { token: tokenB } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixtureA);

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenB,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
    });

    it("rejects staff member without active shift with 404", async () => {
      const fixture = await harness.context.createFixture();
      const token = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${token}`, fixture.userId);
      const { sessionId } = await harness.createSession(fixture);

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("LOCATION_ACCESS_DENIED");
    });
  });

  describe("CHECKING_IN State Authorization", () => {
    it("allows creator on active shift to read draft session", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, { state: "CHECKING_IN" });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionId);
      expect(res.body.state).toBe("CHECKING_IN");
    });

    it("denies peer employee at same location from reading draft session", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const peer = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const peerToken = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${peerToken}`, peer.userId);

      const { sessionId } = await harness.createSession(fixture, { state: "CHECKING_IN" });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: peerToken,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
    });

    it("denies supervisor from taking over unowned draft session", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const supervisor = await harness.addMember(fixture, "VALET_SUPERVISOR", true);
      const supToken = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${supToken}`, supervisor.userId);

      const { sessionId } = await harness.createSession(fixture, { state: "CHECKING_IN" });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: supToken,
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
    });
  });

  describe("AWAITING_PARKING State Authorization", () => {
    it("allows creator when no active task exists", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, { state: "AWAITING_PARKING" });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token,
      });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("AWAITING_PARKING");
    });

    it("denies peer when no active task exists", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const peer = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const peerToken = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${peerToken}`, peer.userId);

      const { sessionId } = await harness.createSession(fixture, { state: "AWAITING_PARKING" });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: peerToken,
      });
      expect(res.status).toBe(404);
    });

    it("allows on-shift employee when task is QUEUED", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const peer = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const peerToken = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${peerToken}`, peer.userId);

      const { sessionId } = await harness.createSession(fixture, { state: "AWAITING_PARKING" });
      await harness.createTask(fixture, sessionId, { status: "QUEUED" });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: peerToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe("AWAITING_PARKING");
    });

    it("allows only assignee when task is ASSIGNED / ACCEPTED", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const tokenA = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${tokenA}`, employeeA.userId);

      const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const tokenB = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

      const { sessionId } = await harness.createSession(fixture, { state: "AWAITING_PARKING" });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: employeeA.membershipId,
        status: "ACCEPTED",
      });

      const resA = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenA,
      });
      expect(resA.status).toBe(200);

      const resB = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenB,
      });
      expect(resB.status).toBe(404);
    });
  });

  describe("PARKING and Post-Parking Authorization", () => {
    it("allows only task assignee in PARKING state", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const tokenA = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${tokenA}`, employeeA.userId);

      const supervisor = await harness.addMember(fixture, "VALET_SUPERVISOR", true);
      const tokenSup = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${tokenSup}`, supervisor.userId);

      const { sessionId } = await harness.createSession(fixture, {
        parkingStartedAt: new Date(),
        state: "PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: employeeA.membershipId,
        status: "IN_PROGRESS",
      });

      const resA = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenA,
      });
      expect(resA.status).toBe(200);
      expect(resA.body.state).toBe("PARKING");

      const resSup = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenSup,
      });
      expect(resSup.status).toBe(404);
    });

    it("allows supervisor in PARKING state if supervisor IS the task assignee", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const supervisor = await harness.addMember(fixture, "VALET_SUPERVISOR", true);
      const tokenSup = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${tokenSup}`, supervisor.userId);

      const { sessionId } = await harness.createSession(fixture, {
        parkingStartedAt: new Date(),
        state: "PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: supervisor.membershipId,
        status: "IN_PROGRESS",
      });

      const res = await harness.request("GET", `/v1/staff/valet-sessions/${sessionId}`, {
        token: tokenSup,
      });
      expect(res.status).toBe(200);
    });

    it("allows completed parking assignee in PARKED and REQUESTED states", async () => {
      const { fixture } = await harness.fixtureWithToken();
      const employee = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
      const token = `token-${randomUUID()}`;
      harness.principals.set(`Bearer ${token}`, employee.userId);

      const zoneId = await harness.createParkingZone(fixture, "ZONE-A");
      const spotId = await harness.createParkingSpot(fixture, zoneId, "A-1");

      const { sessionId } = await harness.createSession(fixture, {
        parkedAt: new Date(),
        parkingSpotId: spotId,
        parkingStartedAt: new Date(),
        parkingZoneId: zoneId,
        state: "REQUESTED",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: employee.membershipId,
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
      expect(res.body.state).toBe("REQUESTED");
      expect(res.body.parking.parkingSpotCode).toBe("A-1");
    });
  });
});

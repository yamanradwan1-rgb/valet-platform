import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStaffCheckInContinuationsHarness,
  type StaffCheckInContinuationsHarness,
} from "./staff-check-in-continuations-harness";

describe("Staff Check-In Continuation Discovery State & Privacy", () => {
  let harness: StaffCheckInContinuationsHarness;

  beforeAll(async () => {
    harness = createStaffCheckInContinuationsHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  describe("State & Task Filtering", () => {
    it("excludes CHECKING_IN drafts", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.createSession(fixture, { state: "CHECKING_IN" });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });

    it("includes AWAITING_PARKING with assigned key slot when no task exists", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const keySlotId = await harness.createKeySlot(fixture, "KEY-99");
      const { sessionId } = await harness.createSession(fixture, {
        keySlotId,
        state: "AWAITING_PARKING",
      });

      const res = await harness.request<{
        continuations: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      expect(res.body.continuations).toHaveLength(1);
      expect(res.body.continuations[0]?.sessionId).toBe(sessionId);
    });

    it("excludes AWAITING_PARKING when a QUEUED parking task exists", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        status: "QUEUED",
        taskType: "PARKING",
      });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });

    it("excludes AWAITING_PARKING when an ASSIGNED or ACCEPTED parking task exists", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId: s1 } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });
      await harness.createTask(fixture, s1, {
        assigneeMembershipId: fixture.membershipId,
        status: "ASSIGNED",
        taskType: "PARKING",
      });

      const { sessionId: s2 } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });
      await harness.createTask(fixture, s2, {
        assigneeMembershipId: fixture.membershipId,
        status: "ACCEPTED",
        taskType: "PARKING",
      });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });

    it("excludes AWAITING_PARKING when an IN_PROGRESS parking task exists", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "IN_PROGRESS",
        taskType: "PARKING",
      });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });

    it("excludes AWAITING_PARKING with contradictory COMPLETED parking task", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        assigneeMembershipId: fixture.membershipId,
        status: "COMPLETED",
        taskType: "PARKING",
      });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });

    it("includes AWAITING_PARKING with CANCELLED historical parking task", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });
      await harness.createTask(fixture, sessionId, {
        status: "CANCELLED",
        taskType: "PARKING",
      });

      const res = await harness.request<{
        continuations: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      expect(res.body.continuations).toHaveLength(1);
      expect(res.body.continuations[0]?.sessionId).toBe(sessionId);
    });

    it("excludes sessions that reached PARKING or later states", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.createSession(fixture, { state: "PARKING" });
      await harness.createSession(fixture, { state: "PARKED" });
      await harness.createSession(fixture, { state: "COMPLETED" });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });
  });

  describe("Cardinality, Ordering & A1 Compatibility", () => {
    it("returns empty array when 0 continuations exist", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );
      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });

    it("returns all continuations ordered by createdAt ASC, sessionId ASC", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const s1 = await harness.createSession(fixture, {
        createdAt: new Date("2026-08-21T10:00:00.000Z"),
        state: "AWAITING_PARKING",
      });
      const s2 = await harness.createSession(fixture, {
        createdAt: new Date("2026-08-21T11:00:00.000Z"),
        state: "AWAITING_PARKING",
      });
      const s3 = await harness.createSession(fixture, {
        createdAt: new Date("2026-08-21T09:00:00.000Z"),
        state: "AWAITING_PARKING",
      });

      const res = await harness.request<{
        continuations: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      expect(res.body.continuations).toHaveLength(3);
      expect(res.body.continuations.map((c) => c.sessionId)).toEqual([
        s3.sessionId,
        s1.sessionId,
        s2.sessionId,
      ]);
    });

    it("proves 100% compatibility with A1 operational detail read", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const { sessionId } = await harness.createSession(fixture, {
        state: "AWAITING_PARKING",
      });

      // 1. Discover continuation through A3
      const a3Res = await harness.request<{
        continuations: Array<{ sessionId: string }>;
      }>("GET", `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`, {
        token,
      });
      expect(a3Res.status).toBe(200);
      expect(a3Res.body.continuations).toHaveLength(1);
      const discoveredId = a3Res.body.continuations[0]!.sessionId;
      expect(discoveredId).toBe(sessionId);

      // 2. Fetch full detail through A1 with the same token
      const a1Res = await harness.request<{
        sessionId: string;
        state: string;
      }>("GET", `/v1/staff/valet-sessions/${discoveredId}`, {
        token,
      });
      expect(a1Res.status).toBe(200);
      expect(a1Res.body.sessionId).toBe(sessionId);
      expect(a1Res.body.state).toBe("AWAITING_PARKING");
    });
  });

  describe("Privacy & Tenant Isolation", () => {
    it("does not expose customer data, tokens, or post-intake assignments", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      await harness.createSession(fixture, { state: "AWAITING_PARKING" });

      const res = await harness.request<{
        continuations: Array<Record<string, unknown>>;
      }>("GET", `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`, {
        token,
      });

      expect(res.status).toBe(200);
      const item = res.body.continuations[0]!;
      expect(item.customerId).toBeUndefined();
      expect(item.customerPhone).toBeUndefined();
      expect(item.customerDisplayName).toBeUndefined();
      expect(item.customerAccessTokenHash).toBeUndefined();
      expect(item.keySlot).toBeUndefined();
      expect(item.parking).toBeUndefined();
    });

    it("prevents continuations from another organization from leaking", async () => {
      const { fixture, token } = await harness.fixtureWithToken();
      const foreign = await harness.context.createFixture();
      await harness.createSession(foreign, { state: "AWAITING_PARKING" });

      const res = await harness.request<{ continuations: unknown[] }>(
        "GET",
        `/v1/staff/check-in/continuations?locationId=${fixture.locationId}`,
        { token },
      );

      expect(res.status).toBe(200);
      expect(res.body.continuations).toEqual([]);
    });
  });
});

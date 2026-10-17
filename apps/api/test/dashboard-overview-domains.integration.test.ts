import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  dashboardSessionStateCounts,
  listDashboardSessions,
} from "../src/modules/dashboard/overview-sessions-query";
import {
  listDashboardTasks,
  listRetrievalQueue,
} from "../src/modules/dashboard/overview-retrieval-tasks-query";
import {
  listActiveShifts,
  listKeyAccountability,
  listOpenIncidents,
} from "../src/modules/dashboard/overview-shifts-keys-incidents-query";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("domains");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const manager = () => context.managerFixture();
let retrievingSessionId = "";
let retrievalTaskId = "";
let freeSlotCode = "";

beforeAll(async () => {
  const fixture = await context.managerFixture();
  const heldSlotId = await context.seedKeySlot("SLOT-A");
  freeSlotCode = "SLOT-B";
  await context.seedKeySlot(freeSlotCode);
  retrievingSessionId = await context.seedSession({
    keySlotId: heldSlotId,
    state: "RETRIEVING",
  });
  await context.seedSession({ state: "PARKED" });
  await context.seedSession({ state: "CHECKING_IN" });
  await context.seedSession({ state: "COMPLETED" });
  await context.seedRetrievalRequest({
    requestedAgoMinutes: 10,
    sessionId: retrievingSessionId,
    status: "OPEN",
  });
  retrievalTaskId = await context.seedTask({
    assigneeMembershipId: fixture.membershipId,
    sessionId: retrievingSessionId,
    status: "ASSIGNED",
    taskType: "RETRIEVAL",
  });
  await context.startActiveShift(fixture, {
    membershipId: fixture.membershipId,
    userId: fixture.userId,
  });
  await context.seedIncident({
    sessionId: retrievingSessionId,
    status: "OPEN",
  });
  await context.seedIncident({
    sessionId: retrievingSessionId,
    status: "RESOLVED",
  });
}, 120_000);

describe("VAL-009C overview domain projections", () => {
  it("lists non-COMPLETED sessions with staff-safe facts only", async () => {
    const fixture = await manager();
    const page = await listDashboardSessions(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 100,
      locationId: fixture.locationId,
    });
    expect(page.items).toHaveLength(3);
    for (const entry of page.items) {
      expect(entry.state).not.toBe("COMPLETED");
      expect(Object.keys(entry).sort()).toEqual(
        [
          "activeTask",
          "createdAt",
          "currentAssigneeMembershipId",
          "keySlot",
          "keySlotId",
          "parkingSpot",
          "parkingSpotId",
          "parkingZone",
          "sessionId",
          "state",
          "updatedAt",
          "vehicle",
        ].sort(),
      );
      expect(Object.keys(entry.vehicle).sort()).toEqual(
        [
          "color",
          "make",
          "model",
          "plateCountry",
          "plateNumberNormalized",
          "temporaryDescriptor",
          "vehicleId",
        ].sort(),
      );
    }
    const held = page.items.find((entry) => entry.keySlotId !== null);
    expect(held?.sessionId).toBe(retrievingSessionId);
    expect(held?.activeTask).toMatchObject({
      taskId: retrievalTaskId,
      assignee: { membershipId: fixture.membershipId },
    });
  });

  it("returns the complete canonical state map with exact counts", async () => {
    const fixture = await manager();
    const response = await dashboardSessionStateCounts(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    const byState = new Map(response.counts.map((c) => [c.state, c.count]));
    expect(byState.get("CHECKING_IN")).toBe(1);
    expect(byState.get("PARKED")).toBe(1);
    expect(byState.get("RETRIEVING")).toBe(1);
    expect(byState.get("COMPLETED")).toBe(1);
    expect(byState.get("READY")).toBe(0);
    expect(byState.get("HANDOFF_PENDING")).toBe(0);
  });

  it("projects the oldest-first retrieval queue with authoritative Task facts", async () => {
    const fixture = await manager();
    const olderSession = await context.seedSession({ state: "REQUESTED" });
    await context.seedRetrievalRequest({
      requestedAgoMinutes: 30,
      sessionId: olderSession,
      status: "ACCEPTED",
    });
    const page = await listRetrievalQueue(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 50,
      locationId: fixture.locationId,
    });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.status).toBe("ACCEPTED");
    expect(page.items[0]!.task).toBeNull();
    const newer = page.items[1]!;
    expect(newer.status).toBe("OPEN");
    expect(newer.valetSessionId).toBe(retrievingSessionId);
    expect(newer.task).toEqual({
      assignee: {
        membershipId: fixture.membershipId,
        identity: {
          firstName: null,
          lastName: null,
          email: expect.stringContaining("@"),
        },
      },
      currentAssigneeMembershipId: fixture.membershipId,
      status: "ASSIGNED",
      taskId: retrievalTaskId,
    });
    expect(Date.parse(page.items[0]!.requestedAt)).toBeLessThan(
      Date.parse(newer.requestedAt),
    );
  });

  it("projects tasks without DispatchEvent history", async () => {
    const fixture = await manager();
    const page = await listDashboardTasks(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 50,
      locationId: fixture.locationId,
    });
    expect(page.items).toHaveLength(1);
    expect(Object.keys(page.items[0]!).sort()).toEqual(
      [
        "assignee",
        "createdAt",
        "currentAssigneeMembershipId",
        "status",
        "taskId",
        "taskType",
        "updatedAt",
        "valetSessionId",
      ].sort(),
    );
    expect(page.items[0]).toMatchObject({
      assignee: { membershipId: fixture.membershipId },
      status: "ASSIGNED",
      taskId: retrievalTaskId,
      taskType: "RETRIEVAL",
    });
  });

  it("lists ACTIVE shifts with membership attribution", async () => {
    const fixture = await manager();
    const page = await listActiveShifts(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 50,
      locationId: fixture.locationId,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      membershipId: fixture.membershipId,
    });
  });

  it("derives key accountability without dumping custody history", async () => {
    const fixture = await manager();
    const page = await listKeyAccountability(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 50,
      locationId: fixture.locationId,
    });
    expect(page.items.map((slot) => slot.code)).toEqual(["SLOT-A", "SLOT-B"]);
    expect(page.items[0]!.holdingSessionId).toBe(retrievingSessionId);
    expect(
      page.items.find((slot) => slot.code === freeSlotCode)?.holdingSessionId,
    ).toBeNull();
  });

  it("bounds incidents to unresolved lifecycle entries", async () => {
    const fixture = await manager();
    const page = await listOpenIncidents(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      limit: 50,
      locationId: fixture.locationId,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ status: "OPEN" });
  });
});

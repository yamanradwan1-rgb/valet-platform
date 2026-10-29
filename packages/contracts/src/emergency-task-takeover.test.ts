import { describe, expect, it } from "vitest";
import {
  emergencyTakeoverContextQuerySchema,
  emergencyTakeoverContextResponseSchema,
  emergencyTakeoverRequestSchema,
  emergencyTakeoverResponseSchema,
} from "./emergency-task-takeover.js";

const operationId = "550e8400-e29b-41d4-a716-446655440000";
const targetId = "550e8400-e29b-41d4-a716-446655440001";
const taskId = "550e8400-e29b-41d4-a716-446655440002";
const sessionId = "550e8400-e29b-41d4-a716-446655440003";
const vehicleId = "550e8400-e29b-41d4-a716-446655440004";

const validRequest = {
  operationId,
  expectedVersion: 7,
  targetAssigneeMembershipId: targetId,
  reason: "  Emergency retrieval handover  ",
};

describe("Emergency Task Takeover shared contracts", () => {
  it("outer-trims the reason while preserving Unicode", () => {
    expect(emergencyTakeoverRequestSchema.parse({
      ...validRequest,
      reason: "  تعذّر على الموظف الاستمرار 🚗  ",
    }).reason).toBe("تعذّر على الموظف الاستمرار 🚗");
  });

  it("accepts exactly 500 Unicode code points", () => {
    expect(emergencyTakeoverRequestSchema.safeParse({
      ...validRequest, reason: "🚗".repeat(500),
    }).success).toBe(true);
  });

  it.each([
    { reason: "" },
    { reason: "  " },
    { reason: "\nReason" },
    { reason: "Reason\t" },
    { reason: "Reason\u0000unsafe" },
    { reason: "🚗".repeat(501) },
    { expectedVersion: 0 },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { targetAssigneeMembershipId: "other-tenant" },
    { operationId: "not-a-uuid" },
    { organizationId: operationId },
    { locationId: operationId },
  ])("rejects invalid or expanded command input %j", (change) => {
    expect(emergencyTakeoverRequestSchema.safeParse({
      ...validRequest, ...change,
    }).success).toBe(false);
  });

  it("limits scoped candidate search to a literal, bounded name/email term", () => {
    expect(emergencyTakeoverContextQuerySchema.parse({ search: "  سليم  " }))
      .toEqual({ search: "سليم" });
    expect(emergencyTakeoverContextQuerySchema.parse({})).toEqual({});
    for (const query of [
      { organizationId: operationId },
      { locationId: operationId },
      { search: "x".repeat(81) },
      { search: "Staff\n" },
      { search: ["one", "two"] },
    ]) {
      expect(emergencyTakeoverContextQuerySchema.safeParse(query).success)
        .toBe(false);
    }
  });

  it("accepts the frozen deterministic receipt shape and rejects reason echoes", () => {
    const result = {
      operationId,
      replayed: false,
      task: {
        id: taskId,
        status: "IN_PROGRESS",
        version: 8,
        assigneeMembershipId: targetId,
      },
      sessionVersion: 13,
    };
    expect(emergencyTakeoverResponseSchema.parse(result)).toEqual(result);
    expect(emergencyTakeoverResponseSchema.safeParse({
      ...result, reason: validRequest.reason,
    }).success).toBe(false);
  });

  it("bounds candidate and event disclosure to the frozen private context", () => {
    const base = {
      canInitiate: true,
      task: {
        id: taskId,
        taskType: "RETRIEVAL",
        status: "IN_PROGRESS",
        version: 7,
        assigneeMembershipId: targetId,
        sessionId,
        sessionState: "HANDOFF_PENDING",
      },
      vehicle: { id: vehicleId, licensePlate: "12-34567", descriptor: null },
      currentAssignee: {
        membershipId: targetId,
        identity: { email: "staff@example.com", firstName: "A", lastName: null },
      },
      custody: {
        source: "NONE",
        latestKeyEventType: null,
        latestKeyEventActorMembershipId: null,
        occurredAt: null,
      },
      resources: { keySlot: null, parkingSpot: null, parkingZone: null },
      eligibleAssignees: [],
      hasMoreEligibleAssignees: false,
      recentCustodyEvents: [],
      recentTakeovers: [],
    } as const;
    expect(emergencyTakeoverContextResponseSchema.safeParse(base).success).toBe(true);
    const candidate = {
      membershipId: targetId,
      identity: { email: "staff@example.com", firstName: null, lastName: null },
    };
    expect(emergencyTakeoverContextResponseSchema.safeParse({
      ...base, eligibleAssignees: Array(51).fill(candidate),
    }).success).toBe(false);
    expect(emergencyTakeoverContextResponseSchema.safeParse({
      ...base, recentTakeovers: Array(11).fill({
        eventId: operationId,
        actorMembershipId: targetId,
        fromAssigneeMembershipId: targetId,
        toAssigneeMembershipId: targetId,
        occurredAt: "2026-10-29T12:00:00Z",
      }),
    }).success).toBe(false);
    expect(emergencyTakeoverContextResponseSchema.safeParse({
      ...base, rawReason: "private", rawGps: [31.9, 35.9],
    }).success).toBe(false);
  });
});

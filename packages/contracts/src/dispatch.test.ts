import { describe, expect, it } from "vitest";

import {
  assignTaskRequestSchema,
  declineTaskRequestSchema,
  reassignTaskRequestSchema,
  taskQueueQuerySchema,
  taskProjectionSchema,
} from "./dispatch.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("VAL-005E strict shared contracts", () => {
  it("accepts self, explicit target, and automatic assignment shapes", () => {
    expect(assignTaskRequestSchema.parse({ expectedVersion: 1 })).toEqual({
      expectedVersion: 1,
    });
    expect(
      assignTaskRequestSchema.parse({
        expectedVersion: 2,
        targetAssigneeMembershipId: id,
      }),
    ).toMatchObject({ targetAssigneeMembershipId: id });
    expect(
      assignTaskRequestSchema.parse({
        assignmentMode: "AUTOMATIC",
        expectedVersion: 3,
      }),
    ).toMatchObject({ assignmentMode: "AUTOMATIC" });
  });

  it("rejects authority fields and conflicting automatic targets", () => {
    expect(
      assignTaskRequestSchema.safeParse({
        expectedVersion: 1,
        organizationId: id,
      }).success,
    ).toBe(false);
    expect(
      assignTaskRequestSchema.safeParse({
        assignmentMode: "AUTOMATIC",
        expectedVersion: 1,
        targetAssigneeMembershipId: id,
      }).success,
    ).toBe(false);
    expect(
      taskQueueQuerySchema.safeParse({ locationId: id, membershipId: id })
        .success,
    ).toBe(false);
  });

  it("trims optional decline reason and treats blank as absent", () => {
    expect(
      declineTaskRequestSchema.parse({
        expectedVersion: 1,
        reason: "  unavailable  ",
      }),
    ).toEqual({ expectedVersion: 1, reason: "unavailable" });
    expect(
      declineTaskRequestSchema.parse({ expectedVersion: 1, reason: "  " }),
    ).toEqual({ expectedVersion: 1, reason: undefined });
  });

  it("bounds reasons and keeps projection minimal", () => {
    expect(
      taskProjectionSchema.parse({
        createdAt: "2026-08-12T00:00:00.000Z",
        currentAssigneeMembershipId: null,
        sessionId: id,
        status: "QUEUED",
        taskId: id,
        taskType: "RETRIEVAL",
        version: 1,
      }).taskType,
    ).toBe("RETRIEVAL");
    expect(
      declineTaskRequestSchema.safeParse({
        expectedVersion: 1,
        reason: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      reassignTaskRequestSchema.safeParse({
        expectedVersion: 1,
        reason: "x".repeat(501),
        targetAssigneeMembershipId: id,
      }).success,
    ).toBe(false);
    expect(
      taskProjectionSchema.safeParse({
        createdAt: "2026-08-12T00:00:00.000Z",
        currentAssigneeMembershipId: null,
        keySlotId: id,
        sessionId: id,
        status: "QUEUED",
        taskId: id,
        taskType: "PARKING",
        version: 1,
      }).success,
    ).toBe(false);
  });
});

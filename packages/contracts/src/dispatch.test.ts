import { describe, expect, it } from "vitest";

import {
  assignTaskRequestSchema,
  declineTaskRequestSchema,
  parkingTaskQueueResponseSchema,
  reassignTaskRequestSchema,
  staffTaskQueueItemSchema,
  staffTaskQueueItemVehicleSchema,
  taskProjectionSchema,
  taskQueueQuerySchema,
  taskQueueResponseSchema,
  taskQueueTrackingProjectionSchema,
  taskQueueWithTrackingResponseSchema,
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
    const retrieval = {
      createdAt: "2026-08-12T00:00:00.000Z",
      currentAssigneeMembershipId: null,
      sessionId: id,
      status: "QUEUED",
      taskId: id,
      taskType: "RETRIEVAL",
      version: 1,
    } as const;
    expect(taskProjectionSchema.parse(retrieval).taskType).toBe("RETRIEVAL");
    expect(
      parkingTaskQueueResponseSchema.safeParse({
        ...retrieval,
        taskType: "PARKING",
      }).success,
    ).toBe(true);
    expect(parkingTaskQueueResponseSchema.safeParse(retrieval).success).toBe(
      false,
    );
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

  it("validates staff task queue item and response schema", () => {
    const item = {
      createdAt: "2026-08-12T00:00:00.000Z",
      currentAssigneeMembershipId: null,
      parkingSpot: "Spot 12",
      parkingZone: "Zone A",
      retrievalRequestedAt: "2026-08-12T00:05:00.000Z",
      sessionId: id,
      status: "QUEUED" as const,
      taskId: id,
      taskType: "RETRIEVAL" as const,
      valetSessionState: "REQUESTED" as const,
      valetSessionVersion: 4,
      vehicle: {
        color: "Black",
        make: "Toyota",
        model: "Camry",
        plateNumberRaw: "87-65432",
        temporaryDescriptor: null,
      },
      version: 1,
    };
    const parsed = staffTaskQueueItemSchema.parse(item);
    expect(parsed.vehicle.plateNumberRaw).toBe("87-65432");
    expect(parsed.parkingZone).toBe("Zone A");
    expect(parsed.retrievalRequestedAt).toBe("2026-08-12T00:05:00.000Z");

    const response = taskQueueResponseSchema.parse({ tasks: [item] });
    expect(response.tasks).toHaveLength(1);

    // Rejects extra fields (e.g. plateCountry, plateNumberNormalized, slaDeadline)
    expect(
      staffTaskQueueItemVehicleSchema.safeParse({
        ...item.vehicle,
        plateCountry: "JO",
      }).success,
    ).toBe(false);
    expect(
      staffTaskQueueItemSchema.safeParse({
        ...item,
        slaDeadline: "2026-08-12T00:15:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("keeps tracking opt-in backward compatible and strict", () => {
    expect(
      taskQueueQuerySchema.parse({ locationId: id, includeTracking: "true" }),
    ).toEqual({ locationId: id, includeTracking: "true" });
    expect(
      taskQueueQuerySchema.safeParse({ locationId: id, includeTracking: "false" })
        .success,
    ).toBe(false);

    expect(
      taskQueueResponseSchema.safeParse({ tasks: [], tracking: { status: "NONE" } })
        .success,
    ).toBe(false);
    expect(
      taskQueueWithTrackingResponseSchema.parse({
        tasks: [],
        tracking: { status: "NONE" },
      }).tracking.status,
    ).toBe("NONE");
    expect(
      taskQueueTrackingProjectionSchema.parse({ status: "AMBIGUOUS" }),
    ).toEqual({ status: "AMBIGUOUS" });
    expect(
      taskQueueTrackingProjectionSchema.safeParse({
        movement: {
          sessionId: id,
          taskId: id,
          taskType: "PARKING",
          trackingSessionId: id,
          trackingStartedAt: "2026-10-07T00:00:00.000Z",
          organizationId: id,
        },
        status: "ELIGIBLE",
      }).success,
    ).toBe(false);
  });
});

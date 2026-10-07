import { z } from "zod";

import { staffValetSessionStateSchema } from "./staff-valet-session.js";

const uuidSchema = z.string().uuid();
const versionSchema = z.number().int().positive();
const reasonSchema = z.string().trim().max(500);

export const taskProjectionSchema = z
  .object({
    createdAt: z.string().datetime({ offset: false }),
    currentAssigneeMembershipId: uuidSchema.nullable(),
    sessionId: uuidSchema,
    status: z.enum(["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
    taskId: uuidSchema,
    taskType: z.enum(["PARKING", "RETRIEVAL"]),
    version: versionSchema,
  })
  .strict();

export const parkingTaskQueueRequestSchema = z.object({}).strict();
export const parkingTaskQueueResponseSchema = taskProjectionSchema.extend({
  taskType: z.literal("PARKING"),
});

export const staffTaskQueueItemVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateNumberRaw: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
  })
  .strict();

export const staffTaskQueueItemSchema = z
  .object({
    createdAt: z.string().datetime({ offset: false }),
    currentAssigneeMembershipId: uuidSchema.nullable(),
    parkingSpot: z.string().nullable(),
    parkingZone: z.string().nullable(),
    retrievalNotificationEnabled: z.boolean().optional(),
    retrievalRequestedAt: z.string().datetime({ offset: false }).nullable(),
    sessionId: uuidSchema,
    status: z.enum(["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"]),
    taskId: uuidSchema,
    taskType: z.enum(["PARKING", "RETRIEVAL"]),
    valetSessionState: staffValetSessionStateSchema.exclude(["CANCELLED"]),
    valetSessionVersion: versionSchema,
    vehicle: staffTaskQueueItemVehicleSchema,
    version: versionSchema,
  })
  .strict();

export const taskQueueQuerySchema = z
  .object({
    includeTracking: z.literal("true").optional(),
    locationId: uuidSchema,
  })
  .strict();
export const taskQueueResponseSchema = z
  .object({ tasks: z.array(staffTaskQueueItemSchema) })
  .strict();

const taskTrackingMovementSchema = z
  .object({
    sessionId: uuidSchema,
    taskId: uuidSchema,
    taskType: z.enum(["PARKING", "RETRIEVAL"]),
    trackingSessionId: uuidSchema,
    trackingStartedAt: z.string().datetime({ offset: false }),
  })
  .strict();

export const taskQueueTrackingProjectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("NONE") }).strict(),
  z
    .object({
      movement: taskTrackingMovementSchema,
      status: z.literal("ELIGIBLE"),
    })
    .strict(),
  z.object({ status: z.literal("AMBIGUOUS") }).strict(),
]);

export const taskQueueWithTrackingResponseSchema = z
  .object({
    tasks: z.array(staffTaskQueueItemSchema),
    tracking: taskQueueTrackingProjectionSchema,
  })
  .strict();

export const assignTaskRequestSchema = z
  .object({
    assignmentMode: z.enum(["AUTOMATIC"]).optional(),
    expectedVersion: versionSchema,
    targetAssigneeMembershipId: uuidSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.assignmentMode !== "AUTOMATIC" ||
      value.targetAssigneeMembershipId === undefined,
  );

export const acceptTaskRequestSchema = z
  .object({ expectedVersion: versionSchema })
  .strict();

export const declineTaskRequestSchema = z
  .object({ expectedVersion: versionSchema, reason: reasonSchema.optional() })
  .strict()
  .transform((value) => ({
    ...value,
    reason: value.reason === "" ? undefined : value.reason,
  }));

export const reassignTaskRequestSchema = z
  .object({
    expectedVersion: versionSchema,
    reason: reasonSchema,
    targetAssigneeMembershipId: uuidSchema,
  })
  .strict();

export const assignTaskResponseSchema = taskProjectionSchema;
export const acceptTaskResponseSchema = taskProjectionSchema;
export const declineTaskResponseSchema = taskProjectionSchema;
export const reassignTaskResponseSchema = taskProjectionSchema;

export type AssignTaskRequest = z.infer<typeof assignTaskRequestSchema>;
export type DeclineTaskRequest = z.infer<typeof declineTaskRequestSchema>;
export type ReassignTaskRequest = z.infer<typeof reassignTaskRequestSchema>;
export type StaffTaskQueueItem = z.infer<typeof staffTaskQueueItemSchema>;
export type StaffTaskQueueItemVehicle = z.infer<
  typeof staffTaskQueueItemVehicleSchema
>;
export type TaskQueueQuery = z.infer<typeof taskQueueQuerySchema>;
export type TaskQueueResponse = z.infer<typeof taskQueueResponseSchema>;
export type TaskQueueTrackingProjection = z.infer<
  typeof taskQueueTrackingProjectionSchema
>;
export type TaskQueueWithTrackingResponse = z.infer<
  typeof taskQueueWithTrackingResponseSchema
>;
export type ParkingTaskQueueResponse = z.infer<
  typeof parkingTaskQueueResponseSchema
>;
export type AssignTaskResponse = z.infer<typeof assignTaskResponseSchema>;
export type AcceptTaskResponse = z.infer<typeof acceptTaskResponseSchema>;

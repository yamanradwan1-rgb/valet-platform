import { z } from "zod";

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
export const parkingTaskQueueResponseSchema = taskProjectionSchema;

export const taskQueueQuerySchema = z
  .object({ locationId: uuidSchema })
  .strict();
export const taskQueueResponseSchema = z
  .object({ tasks: z.array(taskProjectionSchema) })
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
export type TaskQueueQuery = z.infer<typeof taskQueueQuerySchema>;

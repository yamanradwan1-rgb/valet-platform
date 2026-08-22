import { z } from "zod";

import { overviewListResponse } from "./location-overview-pagination.js";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

export const dashboardSessionStateSchema = z.enum([
  "AWAITING_PARKING",
  "CHECKING_IN",
  "COMPLETED",
  "HANDOFF_PENDING",
  "PARKED",
  "PARKING",
  "READY",
  "REQUESTED",
  "RETRIEVING",
]);
export type DashboardSessionState = z.infer<typeof dashboardSessionStateSchema>;

const nullableUuidSchema = uuidSchema.nullable();

export const sessionOverviewEntrySchema = z
  .object({
    sessionId: uuidSchema,
    state: dashboardSessionStateSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    keySlotId: nullableUuidSchema,
    parkingSpotId: nullableUuidSchema,
    currentAssigneeMembershipId: nullableUuidSchema,
    vehicle: z
      .object({
        vehicleId: uuidSchema,
        plateCountry: z.string().nullable(),
        plateNumberNormalized: z.string().nullable(),
        temporaryDescriptor: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type SessionOverviewEntry = z.infer<typeof sessionOverviewEntrySchema>;

export const sessionStateCountEntrySchema = z
  .object({
    state: dashboardSessionStateSchema,
    count: z.number().int().min(0),
  })
  .strict();

export const sessionStateCountsResponseSchema = z
  .object({
    counts: z.array(sessionStateCountEntrySchema).length(9),
  })
  .strict();
export type SessionStateCountsResponse = z.infer<
  typeof sessionStateCountsResponseSchema
>;

export const dashboardTaskStatusSchema = z.enum([
  "QUEUED",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export type DashboardTaskStatus = z.infer<typeof dashboardTaskStatusSchema>;

export const retrievalQueueTaskFactsSchema = z
  .object({
    taskId: uuidSchema,
    status: dashboardTaskStatusSchema,
    currentAssigneeMembershipId: nullableUuidSchema,
  })
  .strict();

export const retrievalQueueEntrySchema = z
  .object({
    requestId: uuidSchema,
    valetSessionId: uuidSchema,
    requestedAt: timestampSchema,
    status: z.enum(["OPEN", "ACCEPTED"]),
    requesterType: z.enum(["CUSTOMER", "STAFF"]),
    task: retrievalQueueTaskFactsSchema.nullable(),
  })
  .strict();
export type RetrievalQueueEntry = z.infer<typeof retrievalQueueEntrySchema>;

export const taskOverviewEntrySchema = z
  .object({
    taskId: uuidSchema,
    taskType: z.enum(["PARKING", "RETRIEVAL"]),
    status: dashboardTaskStatusSchema,
    valetSessionId: uuidSchema,
    currentAssigneeMembershipId: nullableUuidSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type TaskOverviewEntry = z.infer<typeof taskOverviewEntrySchema>;

export const activeShiftOverviewEntrySchema = z
  .object({
    shiftId: uuidSchema,
    membershipId: uuidSchema,
    startedAt: timestampSchema,
  })
  .strict();
export type ActiveShiftOverviewEntry = z.infer<
  typeof activeShiftOverviewEntrySchema
>;

export const keySlotOverviewEntrySchema = z
  .object({
    keySlotId: uuidSchema,
    code: z.string().min(1),
    slotStatus: z.enum(["ACTIVE", "INACTIVE"]),
    holdingSessionId: nullableUuidSchema,
  })
  .strict();
export type KeySlotOverviewEntry = z.infer<typeof keySlotOverviewEntrySchema>;

export const incidentOverviewEntrySchema = z
  .object({
    incidentId: uuidSchema,
    valetSessionId: uuidSchema,
    status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    type: z.string(),
    description: z.string(),
    createdAt: timestampSchema,
    resolvedAt: timestampSchema.nullable(),
  })
  .strict();
export type IncidentOverviewEntry = z.infer<typeof incidentOverviewEntrySchema>;

export const sessionOverviewListResponseSchema = overviewListResponse(
  sessionOverviewEntrySchema,
);
export const retrievalQueueOverviewResponseSchema = overviewListResponse(
  retrievalQueueEntrySchema,
);
export const taskOverviewListResponseSchema = overviewListResponse(
  taskOverviewEntrySchema,
);
export const activeShiftOverviewResponseSchema = overviewListResponse(
  activeShiftOverviewEntrySchema,
);
export const keySlotOverviewResponseSchema = overviewListResponse(
  keySlotOverviewEntrySchema,
);
export const incidentOverviewResponseSchema = overviewListResponse(
  incidentOverviewEntrySchema,
);

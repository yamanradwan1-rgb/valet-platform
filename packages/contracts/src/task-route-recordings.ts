import { z } from "zod";

export const taskRouteRecordingsQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export const taskRouteRecordingSchema = z
  .object({
    trackingSessionId: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    // Immutable segment provenance; NULL must never fall back to the Task owner.
    assigneeMembershipId: z.string().uuid().nullable(),
  })
  .strict();

export const taskRouteRecordingsResponseSchema = z
  .object({
    recordings: z.array(taskRouteRecordingSchema).max(500),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export type TaskRouteRecording = z.infer<typeof taskRouteRecordingSchema>;
export type TaskRouteRecordingsQuery = z.infer<
  typeof taskRouteRecordingsQuerySchema
>;
export type TaskRouteRecordingsResponse = z.infer<
  typeof taskRouteRecordingsResponseSchema
>;

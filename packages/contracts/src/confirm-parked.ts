import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();

export const confirmParkedRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    expectedTaskVersion: positiveVersionSchema,
    parkingSpotCode: z.string().trim().min(1),
  })
  .strict();

export const confirmParkedResponseSchema = z
  .object({
    parkedAt: z.string().datetime({ offset: false }),
    parkingSpotCode: z.string().min(1),
    parkingSpotId: z.string().uuid(),
    parkingZoneId: z.string().uuid(),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("PARKED"),
    taskId: z.string().uuid(),
    taskStatus: z.literal("COMPLETED"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export type ConfirmParkedRequest = z.infer<typeof confirmParkedRequestSchema>;
export type ConfirmParkedResponse = z.infer<typeof confirmParkedResponseSchema>;

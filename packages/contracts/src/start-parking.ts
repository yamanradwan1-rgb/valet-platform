import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();

export const startParkingRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    expectedTaskVersion: positiveVersionSchema,
  })
  .strict();

export const startParkingResponseSchema = z
  .object({
    parkingStartedAt: z.string().datetime({ offset: false }),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("PARKING"),
    taskId: z.string().uuid(),
    taskStatus: z.literal("IN_PROGRESS"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export type StartParkingRequest = z.infer<typeof startParkingRequestSchema>;
export type StartParkingResponse = z.infer<typeof startParkingResponseSchema>;

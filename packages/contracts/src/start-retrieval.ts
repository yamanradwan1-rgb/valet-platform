import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();

export const startRetrievalRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    expectedTaskVersion: positiveVersionSchema,
  })
  .strict();

export const startRetrievalResponseSchema = z
  .object({
    retrievalStartedAt: z.string().datetime({ offset: false }),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("RETRIEVING"),
    taskId: z.string().uuid(),
    taskStatus: z.literal("IN_PROGRESS"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export type StartRetrievalRequest = z.infer<typeof startRetrievalRequestSchema>;

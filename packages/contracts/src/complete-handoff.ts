import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();

export const completeHandoffRequestSchema = z
  .object({ expectedSessionVersion: positiveVersionSchema })
  .strict();

export const completeHandoffResponseSchema = z
  .object({
    retrievalRequestStatus: z.literal("COMPLETED"),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("COMPLETED"),
    taskId: z.string().uuid(),
    taskStatus: z.literal("COMPLETED"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export type CompleteHandoffRequest = z.infer<
  typeof completeHandoffRequestSchema
>;
export type CompleteHandoffResponse = z.infer<
  typeof completeHandoffResponseSchema
>;

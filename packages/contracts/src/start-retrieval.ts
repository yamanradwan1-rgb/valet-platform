import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();
const uuidSchema = z.string().uuid();

export const startRetrievalRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    expectedTaskVersion: positiveVersionSchema,
    keySlotCode: z.string().trim().min(1).optional(),
    keySlotId: uuidSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.keySlotId === undefined || value.keySlotCode !== undefined,
    { message: "Key Slot ID requires a Key Slot code." },
  );

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

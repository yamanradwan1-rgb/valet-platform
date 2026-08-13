import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();

export const markReadyRequestSchema = z
  .object({ expectedSessionVersion: positiveVersionSchema })
  .strict();

export const markReadyResponseSchema = z
  .object({
    readyAt: z.string().datetime({ offset: false }),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("READY"),
    taskId: z.string().uuid(),
    taskStatus: z.literal("IN_PROGRESS"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export type MarkReadyRequest = z.infer<typeof markReadyRequestSchema>;

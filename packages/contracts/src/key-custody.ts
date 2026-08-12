import { z } from "zod";

const uuidSchema = z.string().uuid();

export const assignKeySlotRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    keySlotCode: z.string().trim().min(1),
  })
  .strict();

export const clearKeySlotRequestSchema = z
  .object({ expectedVersion: z.number().int().min(1) })
  .strict();

export const keySlotAssignmentProjectionSchema = z
  .object({
    keySlotCode: z.string().nullable(),
    sessionId: uuidSchema,
    state: z.literal("AWAITING_PARKING"),
    version: z.number().int().min(1),
  })
  .strict();

export const assignKeySlotResponseSchema = keySlotAssignmentProjectionSchema;
export const clearKeySlotResponseSchema = keySlotAssignmentProjectionSchema;

export type AssignKeySlotRequest = z.infer<typeof assignKeySlotRequestSchema>;
export type ClearKeySlotRequest = z.infer<typeof clearKeySlotRequestSchema>;
export type KeySlotAssignmentProjection = z.infer<
  typeof keySlotAssignmentProjectionSchema
>;

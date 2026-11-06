import { z } from "zod";
import { utf16StringMax } from "./utf16-string-max.js";

// Preserve the existing 500 UTF-16 code-unit cap and Zod's max metadata.
export const staffShiftForceEndReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .superRefine(utf16StringMax(500));

export const staffShiftForceEndRequestSchema = z
  .object({
    operationId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    confirmation: z.literal("FORCE_END_SHIFT"),
    reason: staffShiftForceEndReasonSchema,
  })
  .strict();

export const staffShiftForceEndResultSchema = z
  .object({
    operationId: z.string().uuid(),
    shiftId: z.string().uuid(),
    membershipId: z.string().uuid(),
    locationId: z.string().uuid(),
    status: z.literal("ENDED"),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    closureKind: z.literal("ADMIN_FORCE_END"),
    cashReconciliationState: z.literal("PENDING"),
  })
  .strict();

export type StaffShiftForceEndRequest = z.infer<
  typeof staffShiftForceEndRequestSchema
>;
export type StaffShiftForceEndResult = z.infer<
  typeof staffShiftForceEndResultSchema
>;

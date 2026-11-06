import { z } from "zod";

// Preserve the existing 500 UTF-16 code-unit cap. Zod 4.6+ counts Unicode
// code points in .max(), which would admit previously rejected long emoji text.
export const staffShiftForceEndReasonSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((reason, context) => {
    if (reason.length > 500)
      context.addIssue({
        code: "too_big",
        origin: "string",
        maximum: 500,
        inclusive: true,
      });
  });

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

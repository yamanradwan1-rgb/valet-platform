import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();
const reasonSchema = z.string().trim().min(1).max(500);

export const handoffStandardMethodSchema = z.enum([
  "PICKUP_CODE",
  "DYNAMIC_QR",
]);

export const handoffVersionRequestSchema = z
  .object({ expectedSessionVersion: positiveVersionSchema })
  .strict();

export const handoffReasonRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    reason: reasonSchema,
  })
  .strict();

export const issueHandoffVerificationRequestSchema = z
  .object({ method: handoffStandardMethodSchema })
  .strict();

export const verifyPickupCodeRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    pickupCode: z.string().regex(/^\d{4}$/),
  })
  .strict();

export const verifyDynamicQrRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    qrPayload: z.string().regex(/^vhq1\.[A-Za-z0-9_-]{43}$/),
  })
  .strict();

const taskProjectionSchema = z
  .object({
    taskId: z.string().uuid(),
    taskStatus: z.literal("IN_PROGRESS"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export const initiateHandoffResponseSchema = taskProjectionSchema
  .extend({
    handoffPendingAt: z.string().datetime({ offset: false }),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("HANDOFF_PENDING"),
  })
  .strict();

export const verifiedHandoffResponseSchema = taskProjectionSchema
  .extend({
    method: z.enum(["PICKUP_CODE", "DYNAMIC_QR", "SUPERVISOR_OVERRIDE"]),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("HANDOFF_PENDING"),
    verificationStatus: z.literal("VERIFIED"),
    verifiedAt: z.string().datetime({ offset: false }),
  })
  .strict();

export const abortHandoffResponseSchema = taskProjectionSchema
  .extend({
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("READY"),
  })
  .strict();

const guestIssueBase = {
  expiresAt: z.string().datetime({ offset: false }),
  state: z.literal("HANDOFF_PENDING"),
  valetSessionId: z.string().uuid(),
};

export const guestHandoffMaterialResponseSchema = z.discriminatedUnion(
  "method",
  [
    z
      .object({
        ...guestIssueBase,
        method: z.literal("PICKUP_CODE"),
        pickupCode: z.string().regex(/^\d{4}$/),
      })
      .strict(),
    z
      .object({
        ...guestIssueBase,
        method: z.literal("DYNAMIC_QR"),
        qrPayload: z.string().regex(/^vhq1\.[A-Za-z0-9_-]{43}$/),
      })
      .strict(),
  ],
);

export type HandoffStandardMethod = z.infer<typeof handoffStandardMethodSchema>;
export type HandoffVersionRequest = z.infer<typeof handoffVersionRequestSchema>;
export type HandoffReasonRequest = z.infer<typeof handoffReasonRequestSchema>;
export type IssueHandoffVerificationRequest = z.infer<
  typeof issueHandoffVerificationRequestSchema
>;
export type VerifyPickupCodeRequest = z.infer<
  typeof verifyPickupCodeRequestSchema
>;
export type VerifyDynamicQrRequest = z.infer<
  typeof verifyDynamicQrRequestSchema
>;
export type InitiateHandoffResponse = z.infer<
  typeof initiateHandoffResponseSchema
>;
export type VerifiedHandoffResponse = z.infer<
  typeof verifiedHandoffResponseSchema
>;
export type AbortHandoffResponse = z.infer<typeof abortHandoffResponseSchema>;

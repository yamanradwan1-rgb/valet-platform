import { z } from "zod";

export const paymentMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/);

export const validationMutationRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("FULL") }).strict(),
  z.object({ amount: paymentMoneySchema, mode: z.literal("PARTIAL") }).strict(),
  z.object({ mode: z.literal("NONE") }).strict(),
]);

export const paymentTipMutationRequestSchema = z
  .object({ tipAmount: paymentMoneySchema })
  .strict();

export const paymentPayerCorrectionRequestSchema = z
  .object({ servicePayer: z.enum(["CUSTOMER", "VENUE"]) })
  .strict();

export const paymentServiceAmountCorrectionRequestSchema = z
  .object({ serviceAmount: paymentMoneySchema })
  .strict();

const cashSubmissionKeySchema = z.string().min(1).max(200);

const refundReasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => [...value].length <= 500 && !/\p{Cc}/u.test(value));

export const cashReceiptRequestSchema = z
  .object({ submissionIdempotencyKey: cashSubmissionKeySchema })
  .strict();

export const cashAdjustmentRequestSchema = z
  .object({
    amount: paymentMoneySchema.refine(
      (value) => !/^0(?:\.0{1,3})?$/.test(value),
    ),
    entryType: z.enum(["ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE"]),
    reason: z.string().trim().min(1).max(500),
    submissionIdempotencyKey: cashSubmissionKeySchema,
  })
  .strict();

export const refundRequestSchema = z
  .object({
    amount: paymentMoneySchema.refine(
      (value) => !/^0(?:\.0{1,3})?$/.test(value),
    ),
    idempotencyKey: cashSubmissionKeySchema,
    reason: refundReasonSchema,
  })
  .strict();

export const refundResponseSchema = z
  .object({
    amount: paymentMoneySchema,
    completedAt: z.string().datetime({ offset: true }).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    refundId: z.string().uuid(),
    requestedAt: z.string().datetime({ offset: true }),
    status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  })
  .strict();

export const currentValidationSchema = z
  .object({
    amount: paymentMoneySchema,
    id: z.string().uuid(),
    mode: z.enum(["NONE", "FULL", "PARTIAL"]),
  })
  .strict();

export const paymentMutationResponseSchema = z
  .object({
    amountDue: paymentMoneySchema,
    collectionMethod: z.enum(["NONE", "CASH", "DIGITAL"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    currentValidation: currentValidationSchema.nullable(),
    serviceAmount: paymentMoneySchema,
    servicePayer: z.enum(["CUSTOMER", "VENUE"]),
    status: z.enum(["NOT_REQUIRED", "UNPAID", "PENDING", "PAID", "FAILED"]),
    tipAmount: paymentMoneySchema,
    updatedAt: z.string().datetime({ offset: true }),
    valetSessionId: z.string().uuid(),
  })
  .strict();

export const guestPaymentMutationResponseSchema = z
  .object({
    amountDue: paymentMoneySchema,
    collectionMethod: z.enum(["NONE", "CASH", "DIGITAL"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(["NOT_REQUIRED", "UNPAID", "PENDING", "PAID", "FAILED"]),
    tipAmount: paymentMoneySchema,
    valetSessionId: z.string().uuid(),
  })
  .strict();

export const cashMutationResponseSchema = z
  .object({
    amountDue: paymentMoneySchema,
    amountPaid: paymentMoneySchema,
    cashEntryAmount: paymentMoneySchema,
    cashEntryId: z.string().uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    entryType: z.enum([
      "RECEIPT",
      "ADJUSTMENT_INCREASE",
      "ADJUSTMENT_DECREASE",
    ]),
    occurredAt: z.string().datetime({ offset: true }),
    status: z.enum(["UNPAID", "PAID"]),
    valetSessionId: z.string().uuid(),
  })
  .strict();

export type ValidationMutationRequest = z.infer<
  typeof validationMutationRequestSchema
>;
export type PaymentTipMutationRequest = z.infer<
  typeof paymentTipMutationRequestSchema
>;
export type PaymentPayerCorrectionRequest = z.infer<
  typeof paymentPayerCorrectionRequestSchema
>;
export type PaymentServiceAmountCorrectionRequest = z.infer<
  typeof paymentServiceAmountCorrectionRequestSchema
>;
export type CashReceiptRequest = z.infer<typeof cashReceiptRequestSchema>;
export type CashAdjustmentRequest = z.infer<typeof cashAdjustmentRequestSchema>;
export type RefundRequest = z.infer<typeof refundRequestSchema>;
export type RefundResponse = z.infer<typeof refundResponseSchema>;
export type CashMutationResponse = z.infer<typeof cashMutationResponseSchema>;
export type PaymentMutationResponse = z.infer<
  typeof paymentMutationResponseSchema
>;
export type GuestPaymentMutationResponse = z.infer<
  typeof guestPaymentMutationResponseSchema
>;

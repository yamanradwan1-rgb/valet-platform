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
export type PaymentMutationResponse = z.infer<
  typeof paymentMutationResponseSchema
>;

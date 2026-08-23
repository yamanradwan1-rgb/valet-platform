import { z } from "zod";

const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

const exactDecimalTotalSchema = z.string().regex(/^\d+\.\d{3}$/);

export const financialOverviewCurrencyGroupSchema = z
  .object({
    currency: currencyCodeSchema,
    paymentCount: z.number().int().min(0),
    amountDueTotal: exactDecimalTotalSchema,
    amountPaidTotal: exactDecimalTotalSchema,
    tipAmountTotal: exactDecimalTotalSchema,
    succeededRefundAmountTotal: exactDecimalTotalSchema,
    currentValidationAmountTotal: exactDecimalTotalSchema,
    collectionMethodCounts: z.array(
      z
        .object({
          method: z.enum(["NONE", "CASH", "DIGITAL"]),
          count: z.number().int().min(0),
        })
        .strict(),
    ),
    statusCounts: z.array(
      z
        .object({
          status: z.enum([
            "NOT_REQUIRED",
            "UNPAID",
            "PENDING",
            "PAID",
            "FAILED",
          ]),
          count: z.number().int().min(0),
        })
        .strict(),
    ),
  })
  .strict();
export type FinancialOverviewCurrencyGroup = z.infer<
  typeof financialOverviewCurrencyGroupSchema
>;

export const financialOverviewResponseSchema = z
  .object({
    currencies: z.array(financialOverviewCurrencyGroupSchema),
  })
  .strict();
export type FinancialOverviewResponse = z.infer<
  typeof financialOverviewResponseSchema
>;

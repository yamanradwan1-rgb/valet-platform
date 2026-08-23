import { z } from "zod";

import {
  analyticsPeriodEnvelopeFields,
  analyticsRateSchema,
} from "./location-analytics-common.js";

const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

const exactMoneyTotalSchema = z.string().regex(/^\d+\.\d{3}$/);

const signedMoneyTotalSchema = z.string().regex(/^-?\d+\.\d{3}$/);

export const financialAnalyticsCurrencyGroupSchema = z
  .object({
    currency: currencyCodeSchema,
    paidPaymentCount: z.number().int().min(0),
    collectedAmountTotal: exactMoneyTotalSchema,
    tipAmountTotal: exactMoneyTotalSchema,
    digitalPaymentRate: analyticsRateSchema,
    succeededRefundAmountTotal: exactMoneyTotalSchema,
    validationRate: analyticsRateSchema,
    currentValidationAmountTotal: exactMoneyTotalSchema,
  })
  .strict();
export type FinancialAnalyticsCurrencyGroup = z.infer<
  typeof financialAnalyticsCurrencyGroupSchema
>;

export const cashReconciliationEntrySchema = z
  .object({
    currency: currencyCodeSchema,
    cashExpectedTotal: signedMoneyTotalSchema,
    cashReportedTotal: signedMoneyTotalSchema,
    cashVarianceTotal: signedMoneyTotalSchema,
  })
  .strict();
export type CashReconciliationEntry = z.infer<
  typeof cashReconciliationEntrySchema
>;

export const financialAnalyticsResponseSchema = z
  .object({
    ...analyticsPeriodEnvelopeFields,
    currencies: z.array(financialAnalyticsCurrencyGroupSchema),
    cashReconciliation: z.array(cashReconciliationEntrySchema),
  })
  .strict();
export type FinancialAnalyticsResponse = z.infer<
  typeof financialAnalyticsResponseSchema
>;

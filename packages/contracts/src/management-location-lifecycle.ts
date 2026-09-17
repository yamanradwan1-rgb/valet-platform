import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
const boundedRequiredText = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0);

export const managementLocationCreateRequestSchema = z
  .object({
    operationId: uuidSchema,
    name: boundedRequiredText(200),
    code: boundedRequiredText(100),
    addressText: boundedRequiredText(1000),
    timezone: boundedRequiredText(255),
    currency: currencySchema,
  })
  .strict();

export const managementLocationLifecycleCommandSchema = z
  .object({ expectedUpdatedAt: timestampSchema })
  .strict();

export const managementLocationCurrencyCorrectionRequestSchema = z
  .object({
    expectedUpdatedAt: timestampSchema,
    newCurrency: currencySchema,
  })
  .strict();

export const managementLocationTimezoneCorrectionRequestSchema = z
  .object({
    expectedUpdatedAt: timestampSchema,
    newTimezone: boundedRequiredText(255),
    reason: boundedRequiredText(500).refine((value) => !hasControlCharacter(value)),
  })
  .strict();

export const managementLocationReadinessSchema = z
  .object({
    readyForActivation: z.boolean(),
    checks: z
      .object({
        currencySupported: z.boolean(),
        timezoneValid: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const managementLocationDrainSchema = z
  .object({
    blocked: z.boolean(),
    activeShiftPresent: z.boolean(),
    nonCompletedValetSessionPresent: z.boolean(),
    nonTerminalTaskPresent: z.boolean(),
  })
  .strict();

export const managementLocationLifecycleResponseSchema = z
  .object({
    organizationId: uuidSchema,
    locationId: uuidSchema,
    name: z.string().min(1).max(200),
    code: z.string().min(1).max(100),
    addressText: z.string().min(1).max(1000),
    timezone: z.string().min(1).max(255),
    currency: currencySchema,
    status: z.enum(["ACTIVE", "INACTIVE"]),
    acceptingIntake: z.boolean(),
    updatedAt: timestampSchema,
    readiness: managementLocationReadinessSchema,
    drain: managementLocationDrainSchema,
  })
  .strict();

export const managementLocationTimezoneCorrectionResponseSchema = z
  .object({
    location: managementLocationLifecycleResponseSchema,
    impact: z
      .object({
        previousTimezone: z.string().min(1).max(255),
        newTimezone: z.string().min(1).max(255),
        historicalTimestampsRewritten: z.literal(false),
        historicalReportFactsRewritten: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type ManagementLocationCreateRequest = z.infer<
  typeof managementLocationCreateRequestSchema
>;
export type ManagementLocationLifecycleCommand = z.infer<
  typeof managementLocationLifecycleCommandSchema
>;
export type ManagementLocationCurrencyCorrectionRequest = z.infer<
  typeof managementLocationCurrencyCorrectionRequestSchema
>;
export type ManagementLocationTimezoneCorrectionRequest = z.infer<
  typeof managementLocationTimezoneCorrectionRequestSchema
>;
export type ManagementLocationLifecycleResponse = z.infer<
  typeof managementLocationLifecycleResponseSchema
>;
export type ManagementLocationTimezoneCorrectionResponse = z.infer<
  typeof managementLocationTimezoneCorrectionResponseSchema
>;

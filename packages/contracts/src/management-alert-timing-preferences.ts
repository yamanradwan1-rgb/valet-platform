import { z } from "zod";

// DEC-109 / Issue #414. All delays are integer seconds after the
// authoritative source boundary, and do not affect domain SLA or timeouts.
export const managementAlertTimingPreferenceValuesSchema = z
  .object({
    alt01GraceSeconds: z.number().int().min(0).max(60),
    alt02QueueSeconds: z.number().int().min(0).max(300),
    alt03DeclineSeconds: z.number().int().min(0).max(120),
    alt04StageSeconds: z.number().int().min(60).max(900),
    alt06HandoffSeconds: z.number().int().min(60).max(900),
    alt11UnknownPaymentSeconds: z.number().int().min(60).max(600),
  })
  .strict();

export const managementAlertTimingPreferenceDefaults = {
  alt01GraceSeconds: 0,
  alt02QueueSeconds: 60,
  alt03DeclineSeconds: 0,
  alt04StageSeconds: 300,
  alt06HandoffSeconds: 300,
  alt11UnknownPaymentSeconds: 120,
} as const satisfies z.infer<
  typeof managementAlertTimingPreferenceValuesSchema
>;

export const managementAlertTimingPreferencesSetRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    values: managementAlertTimingPreferenceValuesSchema,
  })
  .strict();

export const managementAlertTimingPreferencesResponseSchema = z
  .object({
    organizationId: z.string().uuid(),
    userId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
    values: managementAlertTimingPreferenceValuesSchema,
  })
  .strict();

export type ManagementAlertTimingPreferenceValues = z.infer<
  typeof managementAlertTimingPreferenceValuesSchema
>;
export type ManagementAlertTimingPreferencesSetRequest = z.infer<
  typeof managementAlertTimingPreferencesSetRequestSchema
>;
export type ManagementAlertTimingPreferencesResponse = z.infer<
  typeof managementAlertTimingPreferencesResponseSchema
>;

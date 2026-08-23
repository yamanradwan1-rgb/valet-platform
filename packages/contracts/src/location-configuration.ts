import { z } from "zod";

import { paymentMoneySchema } from "./payments.js";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
const timezoneSchema = z.string().min(1).max(64);

export const configurationSettingKeySchema = z.enum([
  "checkInPhotosRequired",
  "handoffStandardMethodPolicy",
  "trackingEnabled",
  "rawGpsRetentionDays",
  "valetServiceFee",
  "paymentServicePayer",
  "paymentMethodsPolicy",
  "tipsEnabled",
  "validationEnabled",
  "releaseRequiresPayment",
]);
export type ConfigurationSettingKey = z.infer<
  typeof configurationSettingKeySchema
>;

export const handoffStandardMethodPolicyValueSchema = z.enum([
  "PICKUP_CODE",
  "DYNAMIC_QR",
  "EITHER",
]);
export const paymentServicePayerValueSchema = z.enum(["CUSTOMER", "VENUE"]);
export const paymentMethodsPolicyValueSchema = z.enum([
  "CASH_ONLY",
  "DIGITAL_ONLY",
  "CASH_OR_DIGITAL",
]);

const mutationBaseFields = {
  expectedUpdatedAt: timestampSchema,
} as const;

export const setConfigurationOverrideRequestSchema = z.discriminatedUnion(
  "setting",
  [
    z
      .object({
        setting: z.literal("checkInPhotosRequired"),
        value: z.boolean(),
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("handoffStandardMethodPolicy"),
        value: handoffStandardMethodPolicyValueSchema,
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("trackingEnabled"),
        value: z.boolean(),
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("rawGpsRetentionDays"),
        value: z.number().int().min(1).max(2_147_483_647),
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("valetServiceFee"),
        value: paymentMoneySchema,
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("paymentServicePayer"),
        value: paymentServicePayerValueSchema,
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("paymentMethodsPolicy"),
        value: paymentMethodsPolicyValueSchema,
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("tipsEnabled"),
        value: z.boolean(),
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("validationEnabled"),
        value: z.boolean(),
        ...mutationBaseFields,
      })
      .strict(),
    z
      .object({
        setting: z.literal("releaseRequiresPayment"),
        value: z.boolean(),
        ...mutationBaseFields,
      })
      .strict(),
  ],
);

export const clearConfigurationOverrideRequestSchema = z
  .object({
    setting: configurationSettingKeySchema,
    ...mutationBaseFields,
  })
  .strict();
export type SetConfigurationOverrideRequest = z.infer<
  typeof setConfigurationOverrideRequestSchema
>;
export type ClearConfigurationOverrideRequest = z.infer<
  typeof clearConfigurationOverrideRequestSchema
>;

const booleanSettingKeysSchema = z.enum([
  "checkInPhotosRequired",
  "trackingEnabled",
  "tipsEnabled",
  "validationEnabled",
  "releaseRequiresPayment",
]);

const booleanSettingProjectionSchema = z
  .object({
    setting: booleanSettingKeysSchema,
    default: z.boolean(),
    overridePresent: z.boolean(),
    override: z.boolean().nullable(),
    effective: z.boolean(),
  })
  .strict();

const retentionSettingProjectionSchema = z
  .object({
    setting: z.literal("rawGpsRetentionDays"),
    default: z.number().int().min(1),
    overridePresent: z.boolean(),
    override: z.number().int().min(1).nullable(),
    effective: z.number().int().min(1),
  })
  .strict();

const moneySettingProjectionSchema = z
  .object({
    setting: z.literal("valetServiceFee"),
    default: paymentMoneySchema,
    overridePresent: z.boolean(),
    override: paymentMoneySchema.nullable(),
    effective: paymentMoneySchema,
  })
  .strict();

const handoffSettingProjectionSchema = z
  .object({
    setting: z.literal("handoffStandardMethodPolicy"),
    default: handoffStandardMethodPolicyValueSchema,
    overridePresent: z.boolean(),
    override: handoffStandardMethodPolicyValueSchema.nullable(),
    effective: handoffStandardMethodPolicyValueSchema,
  })
  .strict();

const payerSettingProjectionSchema = z
  .object({
    setting: z.literal("paymentServicePayer"),
    default: paymentServicePayerValueSchema,
    overridePresent: z.boolean(),
    override: paymentServicePayerValueSchema.nullable(),
    effective: paymentServicePayerValueSchema,
  })
  .strict();

const methodsSettingProjectionSchema = z
  .object({
    setting: z.literal("paymentMethodsPolicy"),
    default: paymentMethodsPolicyValueSchema,
    overridePresent: z.boolean(),
    override: paymentMethodsPolicyValueSchema.nullable(),
    effective: paymentMethodsPolicyValueSchema,
  })
  .strict();

export const configurationSettingProjectionSchema = z.union([
  booleanSettingProjectionSchema,
  retentionSettingProjectionSchema,
  moneySettingProjectionSchema,
  handoffSettingProjectionSchema,
  payerSettingProjectionSchema,
  methodsSettingProjectionSchema,
]);
export type ConfigurationSettingProjection = z.infer<
  typeof configurationSettingProjectionSchema
>;

export const locationConfigurationResponseSchema = z
  .object({
    organizationId: uuidSchema,
    locationId: uuidSchema,
    timezone: timezoneSchema,
    currency: currencyCodeSchema,
    updatedAt: timestampSchema,
    settings: z.array(configurationSettingProjectionSchema),
  })
  .strict();
export type LocationConfigurationResponse = z.infer<
  typeof locationConfigurationResponseSchema
>;

export const configurationMutationResponseSchema = z
  .object({
    locationId: uuidSchema,
    updatedAt: timestampSchema,
    result: configurationSettingProjectionSchema,
  })
  .strict();
export type ConfigurationMutationResponse = z.infer<
  typeof configurationMutationResponseSchema
>;

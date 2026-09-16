import { z } from "zod";

import {
  handoffStandardMethodPolicyValueSchema,
  paymentMethodsPolicyValueSchema,
  paymentServicePayerValueSchema,
} from "./location-configuration.js";
import { paymentMoneySchema } from "./payments.js";

const timestampSchema = z.string().datetime({ offset: true });
const uuidSchema = z.string().uuid();
const timezoneSchema = z.string().min(1).max(255);
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const managementLanguageSchema = z.enum(["EN", "AR"]);
export const managementNotificationTypeSchema = z.enum([
  "EMPLOYEE_RETRIEVAL_REQUESTED",
  "GUEST_VEHICLE_READY",
]);
export const operatingWeekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

const orderedWeekdays = operatingWeekdaySchema.options;
const closedDaySchema = z
  .object({ weekday: operatingWeekdaySchema, status: z.literal("CLOSED") })
  .strict();
const openDaySchema = z
  .object({
    weekday: operatingWeekdaySchema,
    status: z.literal("OPEN"),
    opensAt: localTimeSchema,
    closesAt: localTimeSchema,
  })
  .strict()
  .refine((day) => day.opensAt < day.closesAt, {
    message: "Operating-hours interval must end after it starts.",
  });

export const operatingHoursDaySchema = z.discriminatedUnion("status", [
  closedDaySchema,
  openDaySchema,
]);
export const operatingHoursValueSchema = z
  .object({
    days: z.array(operatingHoursDaySchema).length(7),
  })
  .strict()
  .superRefine((value, context) => {
    value.days.forEach((day, index) => {
      if (day.weekday !== orderedWeekdays[index]) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "weekday"],
          message: "Operating hours must contain Monday through Sunday in order.",
        });
      }
    });
  });

export const managementSettingKeySchema = z.enum([
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
  "languageDefault",
  "operatingHours",
  "ocrAssistEnabled",
  "parkingSpotRequired",
  "employeeRetrievalRequestedNotificationEnabled",
  "guestVehicleReadyNotificationEnabled",
]);

const mutationBase = { expectedUpdatedAt: timestampSchema } as const;
const booleanSetting = <T extends string>(setting: T) =>
  z.object({ setting: z.literal(setting), value: z.boolean(), ...mutationBase }).strict();

export const managementSettingSetRequestSchema = z.union([
  booleanSetting("checkInPhotosRequired"),
  z.object({
    setting: z.literal("handoffStandardMethodPolicy"),
    value: handoffStandardMethodPolicyValueSchema,
    ...mutationBase,
  }).strict(),
  booleanSetting("trackingEnabled"),
  z.object({
    setting: z.literal("rawGpsRetentionDays"),
    value: z.number().int().min(1).max(2_147_483_647),
    ...mutationBase,
  }).strict(),
  z.object({
    setting: z.literal("valetServiceFee"), value: paymentMoneySchema, ...mutationBase,
  }).strict(),
  z.object({
    setting: z.literal("paymentServicePayer"),
    value: paymentServicePayerValueSchema,
    ...mutationBase,
  }).strict(),
  z.object({
    setting: z.literal("paymentMethodsPolicy"),
    value: paymentMethodsPolicyValueSchema,
    ...mutationBase,
  }).strict(),
  booleanSetting("tipsEnabled"),
  booleanSetting("validationEnabled"),
  booleanSetting("releaseRequiresPayment"),
  z.object({
    setting: z.literal("languageDefault"), value: managementLanguageSchema, ...mutationBase,
  }).strict(),
  z.object({
    setting: z.literal("operatingHours"), value: operatingHoursValueSchema, ...mutationBase,
  }).strict(),
  booleanSetting("ocrAssistEnabled"),
  booleanSetting("parkingSpotRequired"),
  booleanSetting("employeeRetrievalRequestedNotificationEnabled"),
  booleanSetting("guestVehicleReadyNotificationEnabled"),
]);

export const managementSettingClearRequestSchema = z
  .object({ setting: managementSettingKeySchema, ...mutationBase })
  .strict();
export const managementCompanySettingClearRequestSchema = z
  .object({ setting: z.literal("operatingHours"), ...mutationBase })
  .strict();

const companyDefaultsSchema = z.object({
  checkInPhotosRequired: z.boolean(),
  handoffStandardMethodPolicy: handoffStandardMethodPolicyValueSchema,
  trackingEnabled: z.boolean(),
  rawGpsRetentionDays: z.number().int().min(1),
  valetServiceFee: paymentMoneySchema,
  paymentServicePayer: paymentServicePayerValueSchema,
  paymentMethodsPolicy: paymentMethodsPolicyValueSchema,
  tipsEnabled: z.boolean(),
  validationEnabled: z.boolean(),
  releaseRequiresPayment: z.boolean(),
  languageDefault: managementLanguageSchema,
  operatingHours: operatingHoursValueSchema.nullable(),
  ocrAssistEnabled: z.boolean(),
  parkingSpotRequired: z.boolean(),
  employeeRetrievalRequestedNotificationEnabled: z.boolean(),
  guestVehicleReadyNotificationEnabled: z.boolean(),
}).strict();

const inherited = <T extends z.ZodTypeAny>(schema: T) => z.object({
  default: schema,
  overridePresent: z.boolean(),
  override: schema.nullable(),
  effective: schema,
}).strict();
const inheritedNullable = <T extends z.ZodTypeAny>(schema: T) => z.object({
  default: schema.nullable(),
  overridePresent: z.boolean(),
  override: schema.nullable(),
  effective: schema.nullable(),
}).strict();

export const managementCompanySettingsResponseSchema = z.object({
  organizationId: uuidSchema,
  updatedAt: timestampSchema,
  defaults: companyDefaultsSchema,
}).strict();

export const managementLocationSettingsResponseSchema = z.object({
  organizationId: uuidSchema,
  locationId: uuidSchema,
  timezone: timezoneSchema,
  currency: currencySchema,
  updatedAt: timestampSchema,
  settings: z.object({
    checkInPhotosRequired: inherited(z.boolean()),
    handoffStandardMethodPolicy: inherited(handoffStandardMethodPolicyValueSchema),
    trackingEnabled: inherited(z.boolean()),
    rawGpsRetentionDays: inherited(z.number().int().min(1)),
    valetServiceFee: inherited(paymentMoneySchema),
    paymentServicePayer: inherited(paymentServicePayerValueSchema),
    paymentMethodsPolicy: inherited(paymentMethodsPolicyValueSchema),
    tipsEnabled: inherited(z.boolean()),
    validationEnabled: inherited(z.boolean()),
    releaseRequiresPayment: inherited(z.boolean()),
    languageDefault: inherited(managementLanguageSchema),
    operatingHours: inheritedNullable(operatingHoursValueSchema),
    ocrAssistEnabled: inherited(z.boolean()),
    parkingSpotRequired: inherited(z.boolean()),
    employeeRetrievalRequestedNotificationEnabled: inherited(z.boolean()),
    guestVehicleReadyNotificationEnabled: inherited(z.boolean()),
  }).strict(),
}).strict();

export type ManagementSettingKey = z.infer<typeof managementSettingKeySchema>;
export type ManagementSettingSetRequest = z.infer<typeof managementSettingSetRequestSchema>;
export type ManagementSettingClearRequest = z.infer<typeof managementSettingClearRequestSchema>;
export type ManagementCompanySettingClearRequest = z.infer<typeof managementCompanySettingClearRequestSchema>;
export type OperatingHoursValue = z.infer<typeof operatingHoursValueSchema>;
export type ManagementCompanySettingsResponse = z.infer<typeof managementCompanySettingsResponseSchema>;
export type ManagementLocationSettingsResponse = z.infer<typeof managementLocationSettingsResponseSchema>;

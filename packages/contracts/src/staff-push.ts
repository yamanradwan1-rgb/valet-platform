import { z } from "zod";

export const staffPushProviderSchema = z.enum(["FCM", "APNS"]);
export const staffPushPlatformSchema = z.enum(["ANDROID", "IOS"]);
export const staffPushLocaleSchema = z.enum(["en", "ar"]);

export const staffPushRegistrationStateSchema = z.enum([
  "ACTIVE",
  "DISABLED",
  "PROVIDER_INVALID",
  "SUPERSEDED",
]);

export const staffPushKindSchema = z.enum(["EMPLOYEE_RETRIEVAL_REQUESTED"]);

export const staffPushDeliveryStateSchema = z.enum([
  "PENDING",
  "LEASED",
  "RETRY_WAIT",
  "PROVIDER_ACCEPTED",
  "SUPPRESSED",
  "PERMANENT_FAILURE",
  "EXPIRED",
]);

export const staffPushProviderResultClassSchema = z.enum([
  "ACCEPTED",
  "TRANSIENT",
  "RATE_LIMITED",
  "INVALID_ENDPOINT",
  "PERMANENT",
  "CONFIGURATION",
  "UNKNOWN",
]);

export const staffPushIntentIdSchema = z.string().uuid();
export const staffPushRouteIntentSchema = z.literal("TASK_QUEUE");

export const staffPushPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: staffPushKindSchema,
    intentId: staffPushIntentIdSchema,
    routeIntent: staffPushRouteIntentSchema,
  })
  .strict();

export type StaffPushProvider = z.infer<typeof staffPushProviderSchema>;
export type StaffPushPlatform = z.infer<typeof staffPushPlatformSchema>;
export type StaffPushLocale = z.infer<typeof staffPushLocaleSchema>;
export type StaffPushRegistrationState = z.infer<
  typeof staffPushRegistrationStateSchema
>;
export type StaffPushKind = z.infer<typeof staffPushKindSchema>;
export type StaffPushDeliveryState = z.infer<
  typeof staffPushDeliveryStateSchema
>;
export type StaffPushProviderResultClass = z.infer<
  typeof staffPushProviderResultClassSchema
>;
export type StaffPushPayload = z.infer<typeof staffPushPayloadSchema>;

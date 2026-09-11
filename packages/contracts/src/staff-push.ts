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

export const staffPushRegistrationIdSchema = z.string().uuid();
export const staffPushRegistrationRequestSchema = z
  .object({
    provider: z.literal("FCM"),
    platform: z.literal("ANDROID"),
    providerToken: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => value.trim().length > 0),
    installationId: z.string().uuid(),
    appIdentifier: z.literal("com.vaylet.employee"),
    appVersion: z.string().trim().min(1).max(64),
    appBuild: z.string().trim().min(1).max(64),
    locale: staffPushLocaleSchema,
  })
  .strict();

export const staffPushRegistrationResponseSchema = z
  .object({
    registrationId: staffPushRegistrationIdSchema,
    provider: staffPushProviderSchema,
    platform: staffPushPlatformSchema,
    installationId: z.string().uuid(),
    appIdentifier: z.literal("com.vaylet.employee"),
    appVersion: z.string().min(1).max(64),
    appBuild: z.string().min(1).max(64),
    locale: staffPushLocaleSchema,
    state: staffPushRegistrationStateSchema,
    lastConfirmedAt: z.string().datetime({ offset: true }),
  })
  .strict();

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
export type StaffPushRegistrationRequest = z.infer<
  typeof staffPushRegistrationRequestSchema
>;
export type StaffPushRegistrationResponse = z.infer<
  typeof staffPushRegistrationResponseSchema
>;

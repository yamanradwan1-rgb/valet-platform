import { z } from "zod";

import {
  guestInformationHttpsUrlSchema,
  guestInformationLocaleSchema,
  guestPrivacyProjectionSchema,
} from "./guest-information-privacy.js";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime({ offset: true });
const revisionSchema = z.number().int().min(0);

export const guestContactFieldModeSchema = z.enum([
  "INHERIT",
  "OVERRIDE",
  "UNAVAILABLE",
]);
const namedValueSchema = z.string().trim().min(1).max(240);
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/);
const httpsContactSchema = guestInformationHttpsUrlSchema.refine(
  (value) => value.length > 0 && value.length <= 240,
);

export const guestContactCompanyValuesSchema = z
  .object({
    displayName: namedValueSchema.nullable(),
    phone: phoneSchema.nullable(),
    supportUrl: httpsContactSchema.nullable(),
    hours: namedValueSchema.nullable(),
    hoursConfirmed: z.boolean(),
  })
  .strict()
  .refine((value) => value.hours !== null || !value.hoursConfirmed, {
    message: "Hours cannot be confirmed without tenant-provided hours.",
  });

const field = <T extends z.ZodTypeAny>(schema: T) =>
  z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("INHERIT"), value: z.null() }).strict(),
    z.object({ mode: z.literal("OVERRIDE"), value: schema }).strict(),
    z.object({ mode: z.literal("UNAVAILABLE"), value: z.null() }).strict(),
  ]);

export const guestContactLocationValuesSchema = z
  .object({
    displayName: field(namedValueSchema),
    phone: field(phoneSchema),
    supportUrl: field(httpsContactSchema),
    hours: field(namedValueSchema),
    hoursConfirmed: z.boolean(),
  })
  .strict()
  .refine(
    (value) => value.hours.mode === "OVERRIDE" || !value.hoursConfirmed,
    "Location hours can be confirmed only for a tenant-provided override.",
  );

export const managementGuestContactCompanyUpdateRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    values: guestContactCompanyValuesSchema,
  })
  .strict();

export const managementGuestContactLocationUpdateRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    values: guestContactLocationValuesSchema,
  })
  .strict();

export const managementGuestContactCompanyResponseSchema = z
  .object({
    organizationId: uuidSchema,
    revision: revisionSchema,
    updatedAt: dateTimeSchema.nullable(),
    values: guestContactCompanyValuesSchema,
  })
  .strict();

export const guestContactEffectiveFieldSchema = z
  .object({
    source: z.enum(["COMPANY", "LOCATION", "UNAVAILABLE"]),
    value: z.string().nullable(),
  })
  .strict();

export const managementGuestContactLocationResponseSchema = z
  .object({
    organizationId: uuidSchema,
    locationId: uuidSchema,
    revision: revisionSchema,
    updatedAt: dateTimeSchema.nullable(),
    values: guestContactLocationValuesSchema,
    effective: z
      .object({
        displayName: guestContactEffectiveFieldSchema,
        phone: guestContactEffectiveFieldSchema,
        supportUrl: guestContactEffectiveFieldSchema,
        hours: guestContactEffectiveFieldSchema,
      })
      .strict(),
  })
  .strict();

export const guestContactProjectionSchema = z
  .object({
    displayName: namedValueSchema.nullable(),
    phone: phoneSchema.nullable(),
    supportUrl: httpsContactSchema.nullable(),
    hours: namedValueSchema.nullable(),
  })
  .strict();

// This same safe projection serves an authenticated Guest and the authorized
// Dashboard preview; it never transports draft legal text or private identities.
export const guestInformationResponseSchema = z
  .object({
    locale: guestInformationLocaleSchema,
    privacy: guestPrivacyProjectionSchema,
    contact: guestContactProjectionSchema,
  })
  .strict();

// Dashboard Overview includes only the caller's authorized Locations.
// publishedCount counts any active Location publication across the languages.
export const managementGuestInformationOverviewResponseSchema = z
  .object({
    companyName: z.string().min(1).max(240),
    locations: z
      .array(
        z
          .object({
            id: uuidSchema,
            name: z.string().min(1).max(240),
            privacy: z.enum(["PUBLISHED", "UNAVAILABLE", "DRAFT", "NOT_SET"]),
            contact: z.enum(["AVAILABLE", "NOT_SET"]),
          })
          .strict(),
      )
      .max(500),
    publishedCount: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (value) => value.publishedCount <= value.locations.length,
    "Published Location count exceeds authorized total.",
  );

export type GuestContactFieldMode = z.infer<typeof guestContactFieldModeSchema>;
export type GuestContactCompanyValues = z.infer<
  typeof guestContactCompanyValuesSchema
>;
export type GuestContactLocationValues = z.infer<
  typeof guestContactLocationValuesSchema
>;
export type GuestContactProjection = z.infer<
  typeof guestContactProjectionSchema
>;
export type GuestInformationResponse = z.infer<
  typeof guestInformationResponseSchema
>;
export type ManagementGuestInformationOverviewResponse = z.infer<
  typeof managementGuestInformationOverviewResponseSchema
>;
export type ManagementGuestContactCompanyUpdateRequest = z.infer<
  typeof managementGuestContactCompanyUpdateRequestSchema
>;
export type ManagementGuestContactLocationUpdateRequest = z.infer<
  typeof managementGuestContactLocationUpdateRequestSchema
>;
export type ManagementGuestContactCompanyResponse = z.infer<
  typeof managementGuestContactCompanyResponseSchema
>;
export type ManagementGuestContactLocationResponse = z.infer<
  typeof managementGuestContactLocationResponseSchema
>;

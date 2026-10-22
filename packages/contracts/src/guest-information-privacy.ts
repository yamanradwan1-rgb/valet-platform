import { z } from "zod";

export const guestInformationLocaleSchema = z.enum(["en", "ar"]);
const uuidSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime({ offset: true });
const revisionSchema = z.number().int().min(0);

export const guestInformationHttpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    // WHATWG URL treats a backslash as a slash for special schemes; forbid
    // this host-confusion form before constructing any browser action.
    if (value.includes("\\") || /\s|\p{Cc}/u.test(value)) return false;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !!url.hostname &&
        url.port !== "0" &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS URL without embedded credentials.")
  // Canonicalize uppercase schemes and Unicode/IDN hosts to the same ASCII
  // URL representation the PostgreSQL constraint accepts.
  .transform((value) => (value ? new URL(value).href : ""))
  .refine((value) => value.length <= 2048, "HTTPS URL is too long.");

export const guestPrivacyLocaleDraftSchema = z
  .object({
    text: z.string().max(5000),
    url: guestInformationHttpsUrlSchema,
  })
  .strict();

export const guestPrivacyLocalizedContentSchema = z
  .object({
    en: guestPrivacyLocaleDraftSchema,
    ar: guestPrivacyLocaleDraftSchema,
  })
  .strict();

export const managementGuestPrivacySaveRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    drafts: guestPrivacyLocalizedContentSchema,
  })
  .strict();

export const managementGuestPrivacyPublishRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
  })
  .strict();

export const managementGuestPrivacyUnpublishRequestSchema =
  managementGuestPrivacyPublishRequestSchema;

export const managementGuestPrivacyResponseSchema = z
  .object({
    organizationId: uuidSchema,
    locationId: uuidSchema,
    revision: revisionSchema,
    updatedAt: dateTimeSchema.nullable(),
    drafts: guestPrivacyLocalizedContentSchema,
    published: guestPrivacyLocalizedContentSchema.nullable(),
    publishedVersion: z.number().int().positive().nullable(),
    publishedAt: dateTimeSchema.nullable(),
  })
  .strict();

export const guestPrivacyProjectionSchema = z
  .object({
    status: z.enum(["PUBLISHED", "UNAVAILABLE"]),
    text: z.string().max(5000).nullable(),
    url: guestInformationHttpsUrlSchema.nullable(),
    version: z.number().int().positive().nullable(),
    publishedAt: dateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.status === "UNAVAILABLE" &&
      [value.text, value.url, value.version, value.publishedAt].some(
        (item) => item !== null,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Unavailable content must not disclose a snapshot.",
      });
    }
    if (
      value.status === "PUBLISHED" &&
      (!value.version ||
        !value.publishedAt ||
        !(value.text?.trim() || value.url?.trim()))
    ) {
      context.addIssue({
        code: "custom",
        message: "Published content requires a scoped snapshot.",
      });
    }
  });

export type GuestInformationLocale = z.infer<
  typeof guestInformationLocaleSchema
>;
export type GuestPrivacyLocaleDraft = z.infer<
  typeof guestPrivacyLocaleDraftSchema
>;
export type GuestPrivacyLocalizedContent = z.infer<
  typeof guestPrivacyLocalizedContentSchema
>;
export type GuestPrivacyProjection = z.infer<
  typeof guestPrivacyProjectionSchema
>;
export type ManagementGuestPrivacySaveRequest = z.infer<
  typeof managementGuestPrivacySaveRequestSchema
>;
export type ManagementGuestPrivacyPublishRequest = z.infer<
  typeof managementGuestPrivacyPublishRequestSchema
>;
export type ManagementGuestPrivacyResponse = z.infer<
  typeof managementGuestPrivacyResponseSchema
>;

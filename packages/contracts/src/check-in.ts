import { z } from "zod";

import {
  checkInUtcTimestampSchema as utcTimestampSchema,
  checkInUuidSchema as uuidSchema,
  confirmedPlateIdentitySchema,
  temporaryVehicleIdentitySchema,
  vehicleDetailsInputSchema,
  vehicleIdentitySchema,
} from "./check-in-common.js";

const jordanCheckInMobilePhonePattern = /^\+9627[0-9]{8}$/;
const jordanPhonePresentationSeparators = /[\s()\p{Pd}]+/gu;

export const jordanCheckInMobilePhoneSchema = z
  .string()
  .regex(jordanCheckInMobilePhonePattern);

export type JordanCheckInPhoneNormalization =
  { readonly ok: true; readonly phone: string } | { readonly ok: false };

/** Accepts Employee Check-In presentation forms and returns one wire value. */
export function normalizeJordanCheckInPhone(
  input: string,
): JordanCheckInPhoneNormalization {
  const compact = input
    .trim()
    .normalize("NFKC")
    .replace(jordanPhonePresentationSeparators, "");
  const candidate = compact.startsWith("+962")
    ? compact
    : `+962${compact.startsWith("0") ? compact.slice(1) : compact}`;
  const parsed = jordanCheckInMobilePhoneSchema.safeParse(candidate);
  return parsed.success ? { ok: true, phone: parsed.data } : { ok: false };
}

export {
  confirmedPlateIdentitySchema,
  temporaryVehicleIdentitySchema,
  vehicleDetailsInputSchema,
  vehicleIdentitySchema,
};

export const intakeCustomerIntentSchema = z.discriminatedUnion("intent", [
  z
    .object({
      customerId: uuidSchema,
      intent: z.literal("USE_SAVED_CUSTOMER"),
    })
    .strict(),
  z
    .object({
      displayName: z.string().optional(),
      intent: z.literal("DIFFERENT_CUSTOMER"),
      phone: jordanCheckInMobilePhoneSchema,
    })
    .strict(),
]);

export const intakeRequestSchema = z
  .object({
    customer: intakeCustomerIntentSchema.optional(),
    intakeOperationId: z.string(),
    targetLocationId: uuidSchema,
    vehicleDetails: vehicleDetailsInputSchema.optional(),
    vehicleIdentity: vehicleIdentitySchema,
  })
  .strict();

export const vehicleIdentityRequestSchema = z
  .object({
    expectedVehicleUpdatedAt: utcTimestampSchema,
    identity: vehicleIdentitySchema,
  })
  .strict();

export const conditionNoteRequestSchema = z
  .object({ content: z.string() })
  .strict();

export const conditionPhotoRequestSchema = z
  .object({
    contentType: z.string(),
    storageObjectKey: z.string(),
  })
  .strict();

export const emptyRequestSchema = z.object({}).strict();

export const guestAccessIssueRequestSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("ISSUE_OR_ROTATE") }).strict(),
  z
    .object({
      expectedRevokedAt: utcTimestampSchema,
      intent: z.literal("REISSUE_REVOKED"),
    })
    .strict(),
]);

export const completeCheckInRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

// Guest bearer tokens are exactly 32 CSPRNG bytes as unpadded base64url
// (43 characters). The issue response is the only transport of the raw
// token; the strict shape rejects any other credential material.
export const guestAccessRawTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/);

export const intakeResponseSchema = z
  .object({
    createdAt: utcTimestampSchema,
    color: z.string().nullable(),
    customerId: uuidSchema.nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    state: z.literal("CHECKING_IN"),
    valetSessionId: uuidSchema,
    vehicleId: uuidSchema,
    vehicleUpdatedAt: utcTimestampSchema,
    version: z.literal(1),
  })
  .strict();

export const vehicleIdentityResponseSchema = z
  .object({
    identityMode: z.enum(["CONFIRMED_PLATE", "TEMPORARY_DESCRIPTOR"]),
    plateCountry: z.string().nullable(),
    plateNumberNormalized: z.string().nullable(),
    plateNumberRaw: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
    valetSessionId: uuidSchema,
    vehicleId: uuidSchema,
    vehicleUpdatedAt: utcTimestampSchema,
  })
  .strict();

export const conditionNoteResponseSchema = z
  .object({
    conditionNoteId: uuidSchema,
    content: z.string(),
    createdAt: utcTimestampSchema,
    supersedesConditionNoteId: uuidSchema.nullable(),
    valetSessionId: uuidSchema,
  })
  .strict();

export const conditionPhotoResponseSchema = z
  .object({
    contentType: z.string(),
    createdAt: utcTimestampSchema,
    valetSessionId: uuidSchema,
    vehiclePhotoId: uuidSchema,
  })
  .strict();

export const conditionCompletionResponseSchema = z
  .object({
    completedAt: utcTimestampSchema,
    valetSessionId: uuidSchema,
  })
  .strict();

export const guestAccessIssueResponseSchema = z
  .object({
    expiresAt: utcTimestampSchema,
    issuedAt: utcTimestampSchema,
    mutationKind: z.enum(["ISSUED", "ROTATED"]),
    rawToken: guestAccessRawTokenSchema,
    valetSessionId: uuidSchema,
  })
  .strict();

export const guestAccessRevokeResponseSchema = z
  .object({
    revokedAt: utcTimestampSchema,
    valetSessionId: uuidSchema,
  })
  .strict();

export const completeCheckInResponseSchema = z
  .object({
    checkingInCompletedAt: utcTimestampSchema,
    state: z.literal("AWAITING_PARKING"),
    valetSessionId: uuidSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const guestSafeSessionResponseSchema = z
  .object({
    guestVehicleReadyNotificationEnabled: z.boolean().optional(),
    readyAt: utcTimestampSchema.nullable(),
    state: z.enum([
      "AWAITING_PARKING",
      "CHECKING_IN",
      "COMPLETED",
      "HANDOFF_PENDING",
      "PARKED",
      "PARKING",
      "READY",
      "REQUESTED",
      "RETRIEVING",
    ]),
    valetSessionId: uuidSchema,
    vehicle: z
      .object({
        color: z.string().nullable(),
        make: z.string().nullable(),
        model: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

export const guestEffectiveBrandingSchema = z
  .object({
    displayName: z
      .string()
      .min(1)
      .refine((value) => Array.from(value).length <= 120)
      .refine((value) => !/\p{Cc}/u.test(value)),
    primaryColor: z.string().regex(/^#[0-9A-F]{6}$/),
  })
  .strict();

export const guestSessionReadResponseSchema = guestSafeSessionResponseSchema
  .extend({
    branding: guestEffectiveBrandingSchema,
  })
  .strict();

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;
export type IntakeResponse = z.infer<typeof intakeResponseSchema>;
export type IntakeCustomerIntent = z.infer<typeof intakeCustomerIntentSchema>;
export type VehicleIdentityRequest = z.infer<
  typeof vehicleIdentityRequestSchema
>;
export type VehicleIdentityResponse = z.infer<
  typeof vehicleIdentityResponseSchema
>;
export type ConditionNoteRequest = z.infer<typeof conditionNoteRequestSchema>;
export type ConditionNoteResponse = z.infer<typeof conditionNoteResponseSchema>;
export type ConditionPhotoRequest = z.infer<typeof conditionPhotoRequestSchema>;
export type ConditionCompletionResponse = z.infer<
  typeof conditionCompletionResponseSchema
>;
export type GuestAccessIssueRequest = z.infer<
  typeof guestAccessIssueRequestSchema
>;
export type GuestAccessIssueResponse = z.infer<
  typeof guestAccessIssueResponseSchema
>;
export type GuestAccessRevokeResponse = z.infer<
  typeof guestAccessRevokeResponseSchema
>;
export type CompleteCheckInRequest = z.infer<
  typeof completeCheckInRequestSchema
>;
export type CompleteCheckInResponse = z.infer<
  typeof completeCheckInResponseSchema
>;
export type GuestSessionReadResponse = z.infer<
  typeof guestSessionReadResponseSchema
>;

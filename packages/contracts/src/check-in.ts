import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

const plateCandidateSchema = z
  .object({
    plateCountry: z.string().optional(),
    plateNumberRaw: z.string(),
    source: z.enum(["ANPR", "OCR"]),
  })
  .strict();

export const vehicleIdentitySchema = z.discriminatedUnion("mode", [
  z
    .object({
      confirmedByHuman: z.boolean(),
      mode: z.literal("CONFIRMED_PLATE"),
      plateCandidate: plateCandidateSchema.optional(),
      plateCountry: z.string(),
      plateNumberRaw: z.string(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("TEMPORARY_DESCRIPTOR"),
      temporaryDescriptor: z.string(),
    })
    .strict(),
]);

export const intakeRequestSchema = z
  .object({
    customer: z
      .object({
        displayName: z.string().optional(),
        phone: z.string(),
      })
      .strict()
      .optional(),
    intakeOperationId: z.string(),
    targetLocationId: uuidSchema,
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

export const intakeResponseSchema = z
  .object({
    createdAt: utcTimestampSchema,
    customerId: uuidSchema.nullable(),
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
    rawToken: z.string(),
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

export type IntakeRequest = z.infer<typeof intakeRequestSchema>;
export type VehicleIdentityRequest = z.infer<
  typeof vehicleIdentityRequestSchema
>;
export type ConditionNoteRequest = z.infer<typeof conditionNoteRequestSchema>;
export type ConditionPhotoRequest = z.infer<typeof conditionPhotoRequestSchema>;
export type GuestAccessIssueRequest = z.infer<
  typeof guestAccessIssueRequestSchema
>;
export type CompleteCheckInRequest = z.infer<
  typeof completeCheckInRequestSchema
>;

import { z } from "zod";

import {
  shiftPresenceActionSchema,
  shiftPresenceClassificationSchema,
  shiftPresenceExceptionReasonSchema,
  shiftPresenceExceptionStatusSchema,
  shiftPresenceMeasurementSchema,
  shiftPresenceReasonSchema,
} from "./shift-presence.js";
import { shiftPresenceRevisionSchema } from "./shift-presence-policy.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const cash = z.string().regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/);
const evidenceIdentity = { operationId: uuid, challengeId: uuid };

export const shiftPresenceEvidenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...evidenceIdentity,
      kind: z.literal("MEASURED"),
      clientSampleId: uuid,
      measurement: shiftPresenceMeasurementSchema,
    })
    .strict(),
  z
    .object({
      ...evidenceIdentity,
      kind: z.literal("EXCEPTION"),
      exceptionId: uuid,
    })
    .strict(),
]);

export const shiftPresenceChallengeIntentSchema = z.discriminatedUnion(
  "action",
  [
    z
      .object({
        action: z.literal("START"),
        targetLocationId: uuid,
        operationId: uuid,
      })
      .strict(),
    z
      .object({
        action: z.literal("END"),
        shiftId: uuid,
        cashReported: cash,
        operationId: uuid,
      })
      .strict(),
  ],
);

export const shiftPresenceChallengeResponseSchema = z
  .object({
    operationId: uuid,
    challengeId: uuid,
    action: shiftPresenceActionSchema,
    locationId: uuid,
    shiftId: uuid.nullable(),
    issuedAt: timestamp,
    expiresAt: timestamp,
  })
  .strict();

export const shiftPresenceDenialReasonSchema = z.enum([
  "APPROVER_AUTHORITY_REVOKED",
  "PRESENCE_REQUIRED",
  "PRESENCE_REJECTED",
]);

export const shiftPresenceOperationStatusResponseSchema = z.discriminatedUnion(
  "state",
  [
    z.object({ state: z.literal("PENDING"), operationId: uuid }).strict(),
    z.object({ state: z.literal("EXPIRED"), operationId: uuid }).strict(),
    z
      .object({
        state: z.literal("RECOVERABLE"),
        operationId: uuid,
        action: shiftPresenceActionSchema,
        status: z.enum(["COMMITTED", "DENIED", "EXPIRED"]),
        shiftId: uuid.nullable(),
        decisionId: uuid.nullable(),
        denialReason: shiftPresenceDenialReasonSchema.nullable(),
      })
      .strict(),
  ],
);

export const shiftPresenceExceptionCreateRequestSchema = z
  .object({
    challengeId: uuid,
    reason: shiftPresenceExceptionReasonSchema,
  })
  .strict();

export const shiftPresenceExceptionResponseSchema = z
  .object({
    exceptionId: uuid,
    locationId: uuid,
    action: shiftPresenceActionSchema,
    shiftId: uuid.nullable(),
    reason: shiftPresenceExceptionReasonSchema,
    status: shiftPresenceExceptionStatusSchema,
    revision: shiftPresenceRevisionSchema,
    requestedAt: timestamp,
    expiresAt: timestamp,
    reviewedAt: timestamp.nullable(),
    terminalAt: timestamp.nullable(),
  })
  .strict();

export const shiftPresenceSummarySchema = z
  .object({
    classification: shiftPresenceClassificationSchema,
    reason: shiftPresenceReasonSchema,
  })
  .strict();

export type ShiftPresenceEvidence = z.infer<typeof shiftPresenceEvidenceSchema>;
export type ShiftPresenceChallengeIntent = z.infer<
  typeof shiftPresenceChallengeIntentSchema
>;
export type ShiftPresenceDenialReason = z.infer<
  typeof shiftPresenceDenialReasonSchema
>;

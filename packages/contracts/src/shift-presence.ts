import { z } from "zod";

import { shiftPresenceModeSchema, shiftPresenceRevisionSchema } from "./shift-presence-policy.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const shiftPresenceScopeSchema = z.object({
  organizationId: uuid, locationId: uuid, userId: uuid, membershipId: uuid,
}).strict();
export const shiftPresenceActionSchema = z.enum(["START", "END"]);
export const shiftPresenceClassificationSchema = z.enum([
  "CONFIDENT_INSIDE", "CONFIDENT_OUTSIDE", "AMBIGUOUS_EDGE",
  "CONFIGURATION_UNUSABLE", "MEASUREMENT_UNUSABLE",
]);
export const shiftPresenceReasonSchema = z.enum([
  "INSIDE", "OUTSIDE", "EDGE", "NO_ACTIVE_ZONE", "INVALID_CONFIGURATION",
  "INVALID_FIX", "INACCURATE_FIX", "STALE_FIX", "FUTURE_FIX",
]);
export const shiftPresenceBandSchema = z.enum(["ACCEPTABLE", "UNUSABLE", "NOT_EVALUATED"]);
export const shiftPresenceDigestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const shiftPresenceZoneSchema = z.object({
  id: uuid, organizationId: uuid, locationId: uuid,
  code: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(5).max(1000),
  state: z.enum(["ACTIVE", "DISABLED"]),
  revision: shiftPresenceRevisionSchema,
}).strict();

export const shiftPresenceMeasurementSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().finite().positive(),
  capturedAt: timestamp,
}).strict();

const operationShape = {
  ...shiftPresenceScopeSchema.shape,
  operationId: uuid,
  targetFingerprint: shiftPresenceDigestSchema,
};
export const shiftPresenceOperationSchema = z.discriminatedUnion("action", [
  z.object({ ...operationShape, action: z.literal("START"), shiftId: z.null() }).strict(),
  z.object({ ...operationShape, action: z.literal("END"), shiftId: uuid }).strict(),
]);

export const shiftPresenceDecisionSchema = z.object({
  ...shiftPresenceScopeSchema.shape,
  action: shiftPresenceActionSchema,
  shiftId: uuid.nullable(),
  operationId: uuid,
  challengeId: uuid,
  policyFingerprint: shiftPresenceDigestSchema,
  appliedMode: shiftPresenceModeSchema,
  companyPolicyRevision: shiftPresenceRevisionSchema,
  locationPolicyRevision: shiftPresenceRevisionSchema,
  zoneId: uuid.nullable(),
  zoneRevision: shiftPresenceRevisionSchema.nullable(),
  classification: shiftPresenceClassificationSchema,
  reason: shiftPresenceReasonSchema,
  accuracyBand: shiftPresenceBandSchema,
  freshnessBand: shiftPresenceBandSchema,
  exceptionId: uuid.nullable(),
}).strict().superRefine((value, context) => {
  if (value.action === "END" && value.shiftId === null) {
    context.addIssue({ code: "custom", path: ["shiftId"], message: "END requires its exact Shift." });
  }
  if ((value.zoneId === null) !== (value.zoneRevision === null)) {
    context.addIssue({ code: "custom", path: ["zoneId"], message: "Zone identity and revision must agree." });
  }
  const reasons = {
    CONFIDENT_INSIDE: ["INSIDE"], CONFIDENT_OUTSIDE: ["OUTSIDE"], AMBIGUOUS_EDGE: ["EDGE"],
    CONFIGURATION_UNUSABLE: ["NO_ACTIVE_ZONE", "INVALID_CONFIGURATION"],
    MEASUREMENT_UNUSABLE: ["INVALID_FIX", "INACCURATE_FIX", "STALE_FIX", "FUTURE_FIX"],
  };
  if (!reasons[value.classification].includes(value.reason)) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Reason must match classification." });
  }
  const bands = value.classification === "CONFIGURATION_UNUSABLE" ? null
    : value.classification !== "MEASUREMENT_UNUSABLE" ? ["ACCEPTABLE", "ACCEPTABLE"]
      : value.reason === "INVALID_FIX" ? ["UNUSABLE", "UNUSABLE"]
        : value.reason === "INACCURATE_FIX" ? ["UNUSABLE", "NOT_EVALUATED"] : ["ACCEPTABLE", "UNUSABLE"];
  if (bands !== null && (value.accuracyBand !== bands[0] || value.freshnessBand !== bands[1])) {
    context.addIssue({ code: "custom", path: ["accuracyBand"], message: "Bands must match evaluated checks." });
  }
});

export const shiftPresenceExceptionReasonSchema = z.enum([
  "LOCATION_UNAVAILABLE", "GPS_UNAVAILABLE", "OUTSIDE_ZONE", "AMBIGUOUS_FIX",
]);
export const shiftPresenceExceptionStatusSchema = z.enum([
  "PENDING", "APPROVED", "REJECTED", "EXPIRED", "CONSUMED",
]);
export const shiftPresenceExceptionRequestSchema = z.object({
  ...shiftPresenceOperationSchema.options[0].shape,
  action: shiftPresenceActionSchema,
  shiftId: uuid.nullable(), challengeId: uuid, reason: shiftPresenceExceptionReasonSchema,
}).strict().refine((value) => (value.action === "START") === (value.shiftId === null), {
  message: "Exception target must match its action.",
});

export type ShiftPresenceScope = z.infer<typeof shiftPresenceScopeSchema>;
export type ShiftPresenceZone = z.infer<typeof shiftPresenceZoneSchema>;
export type ShiftPresenceMeasurement = z.infer<typeof shiftPresenceMeasurementSchema>;
export type ShiftPresenceOperation = z.infer<typeof shiftPresenceOperationSchema>;
export type ShiftPresenceDecision = z.infer<typeof shiftPresenceDecisionSchema>;
export type ShiftPresenceClassification = z.infer<typeof shiftPresenceClassificationSchema>;
export type ShiftPresenceReason = z.infer<typeof shiftPresenceReasonSchema>;

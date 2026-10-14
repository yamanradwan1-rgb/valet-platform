import { z } from "zod";

/** Wire contract v1; provider and database details never cross this boundary. */
export const CONDITION_PHOTO_UPLOAD_CONTRACT_VERSION = 1 as const;
export const CONDITION_PHOTO_MAX_JPEG_BYTES = 8 * 1024 * 1024;
export const CONDITION_PHOTO_MAX_RETRY_SECONDS = 900;

const uuid = z.string().uuid();
const utcInstant = z.string().datetime({ offset: false }).regex(/Z$/);
const jpegByteSize = z.number().int().positive().max(CONDITION_PHOTO_MAX_JPEG_BYTES);

export const conditionPhotoOperationIdSchema = uuid;
export const conditionPhotoValetSessionIdSchema = uuid;
export const conditionPhotoVehiclePhotoIdSchema = uuid;
export const conditionPhotoOperationStatusSchema = z.enum([
  "PENDING",
  "VERIFIED",
  "EXPIRED",
  "REJECTED",
]);
export const conditionPhotoPendingRetryActionSchema = z.enum([
  "WAIT",
  "RECONCILE",
  "RESEND_SAME_BYTES",
]);
export const conditionPhotoTerminalReasonSchema = z.enum([
  "EXPIRED",
  "INVALID_IMAGE",
  "SESSION_INELIGIBLE",
]);
export const conditionPhotoSafeErrorCodeSchema = z.enum([
  "CONDITION_PHOTO_NOT_FOUND",
  "CONDITION_PHOTO_TOO_LARGE",
  "CONDITION_PHOTO_INVALID_IMAGE",
  "CONDITION_PHOTO_OPERATION_CONFLICT",
  "CONDITION_PHOTO_LIMIT_REACHED",
  "CONDITION_PHOTO_EXPIRED",
  "CONDITION_PHOTO_RATE_LIMITED",
  "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
]);

const operationIdentity = {
  operationId: conditionPhotoOperationIdSchema,
  valetSessionId: conditionPhotoValetSessionIdSchema,
};

export const conditionPhotoPendingStatusSchema = z
  .object({
    ...operationIdentity,
    status: z.literal("PENDING"),
    retryAction: conditionPhotoPendingRetryActionSchema,
    retryAfterSeconds: z.number().int().min(1).max(CONDITION_PHOTO_MAX_RETRY_SECONDS),
  })
  .strict();

export const conditionPhotoVerifiedStatusSchema = z
  .object({
    ...operationIdentity,
    status: z.literal("VERIFIED"),
    vehiclePhotoId: conditionPhotoVehiclePhotoIdSchema,
    contentType: z.literal("image/jpeg"),
    byteSize: jpegByteSize,
    verifiedAt: utcInstant,
  })
  .strict();

export const conditionPhotoExpiredStatusSchema = z
  .object({
    ...operationIdentity,
    status: z.literal("EXPIRED"),
    retryAction: z.literal("NEW_CAPTURE"),
    reason: z.literal("EXPIRED"),
  })
  .strict();

export const conditionPhotoRejectedStatusSchema = z
  .object({
    ...operationIdentity,
    status: z.literal("REJECTED"),
    retryAction: z.literal("NEW_CAPTURE"),
    reason: z.enum(["INVALID_IMAGE", "SESSION_INELIGIBLE"]),
  })
  .strict();

export const conditionPhotoUploadStatusSchema = z.discriminatedUnion("status", [
  conditionPhotoPendingStatusSchema,
  conditionPhotoVerifiedStatusSchema,
  conditionPhotoExpiredStatusSchema,
  conditionPhotoRejectedStatusSchema,
]);
export const conditionPhotoUploadResultSchema = conditionPhotoUploadStatusSchema;

/** P2 enforces exactly one multipart image and a strict size/byte decoder. */
export const conditionPhotoUploadFieldsSchema = z
  .object({ operationId: conditionPhotoOperationIdSchema })
  .strict();
export const conditionPhotoSessionParamsSchema = z
  .object({ sessionId: conditionPhotoValetSessionIdSchema })
  .strict();
export const conditionPhotoOperationParamsSchema = z
  .object({
    sessionId: conditionPhotoValetSessionIdSchema,
    operationId: conditionPhotoOperationIdSchema,
  })
  .strict();
export const conditionPhotoReconcileRequestSchema = z.object({}).strict();
export const conditionPhotoNoQuerySchema = z.object({}).strict();

export const conditionPhotoPolicySourceSchema = z.enum([
  "LOCATION_OVERRIDE",
  "ORGANIZATION_DEFAULT",
]);
export const conditionPhotoPolicyHintSchema = z
  .object({
    required: z.boolean(),
    source: conditionPhotoPolicySourceSchema,
  })
  .strict();

export const conditionPhotoStateDiscoverySchema = z
  .object({
    valetSessionId: conditionPhotoValetSessionIdSchema,
    photoPolicy: conditionPhotoPolicyHintSchema,
    qualifyingPhotoPresent: z.boolean(),
    pendingOperation: conditionPhotoPendingStatusSchema.nullable(),
    latestOperation: z
      .union([
        conditionPhotoVerifiedStatusSchema,
        conditionPhotoExpiredStatusSchema,
        conditionPhotoRejectedStatusSchema,
      ])
      .nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    for (const field of ["pendingOperation", "latestOperation"] as const) {
      const operation = state[field];
      if (operation && operation.valetSessionId !== state.valetSessionId) {
        context.addIssue({
          code: "custom",
          path: [field, "valetSessionId"],
          message: "Photo operation must belong to the exact requested session.",
        });
      }
    }
  });

export type ConditionPhotoUploadStatus = z.infer<
  typeof conditionPhotoUploadStatusSchema
>;
export type ConditionPhotoUploadResult = ConditionPhotoUploadStatus;
export type ConditionPhotoStateDiscovery = z.infer<
  typeof conditionPhotoStateDiscoverySchema
>;
export type ConditionPhotoUploadFields = z.infer<
  typeof conditionPhotoUploadFieldsSchema
>;
export type ConditionPhotoSafeErrorCode = z.infer<
  typeof conditionPhotoSafeErrorCodeSchema
>;

import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });
const positiveVersionSchema = z.number().int().positive();

export const staffValetSessionStateSchema = z.enum([
  "CHECKING_IN",
  "AWAITING_PARKING",
  "PARKING",
  "PARKED",
  "REQUESTED",
  "RETRIEVING",
  "READY",
  "HANDOFF_PENDING",
  "COMPLETED",
  "CANCELLED",
]);

export type StaffValetSessionState = z.infer<
  typeof staffValetSessionStateSchema
>;

export const staffValetSessionVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateCountry: z.string().nullable(),
    plateNumberRaw: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
    vehicleId: uuidSchema,
    vehicleUpdatedAt: utcTimestampSchema,
  })
  .strict();

export type StaffValetSessionVehicle = z.infer<
  typeof staffValetSessionVehicleSchema
>;

export const staffValetSessionCheckInSchema = z
  .object({
    conditionCompletedAt: utcTimestampSchema.nullable(),
  })
  .strict();

export type StaffValetSessionCheckIn = z.infer<
  typeof staffValetSessionCheckInSchema
>;

export const staffValetSessionKeySlotSchema = z
  .object({
    code: z.string().min(1),
    keySlotId: uuidSchema.optional(),
  })
  .strict();

export type StaffValetSessionKeySlot = z.infer<
  typeof staffValetSessionKeySlotSchema
>;

export const staffValetSessionParkingSchema = z
  .object({
    parkedAt: utcTimestampSchema.nullable(),
    parkingSpotCode: z.string().nullable(),
    parkingStartedAt: utcTimestampSchema.nullable(),
    parkingZoneCode: z.string().nullable(),
  })
  .strict();

export type StaffValetSessionParking = z.infer<
  typeof staffValetSessionParkingSchema
>;

export const staffValetSessionHandoffVerificationSchema = z
  .object({
    method: z.enum(["DYNAMIC_QR", "PICKUP_CODE", "SUPERVISOR_OVERRIDE"]),
    status: z.enum(["PENDING", "VERIFIED"]),
    verifiedAt: utcTimestampSchema.nullable(),
  })
  .strict();

export type StaffValetSessionHandoffVerification = z.infer<
  typeof staffValetSessionHandoffVerificationSchema
>;

/**
 * Safe handoff projection for the staff A1 read. Contains only operational
 * facts; never proof material, secret hashes, attempts, expiry, override
 * reasons, or anti-abuse internals. Verification facts are populated only
 * while state is HANDOFF_PENDING; terminal COMPLETED proves itself.
 */
export const staffValetSessionHandoffSchema = z
  .object({
    pendingAt: utcTimestampSchema.nullable(),
    verification: staffValetSessionHandoffVerificationSchema.nullable(),
  })
  .strict();

export type StaffValetSessionHandoff = z.infer<
  typeof staffValetSessionHandoffSchema
>;

/**
 * Safe Guest Access projection for the staff detail read. Contains only
 * operational status facts; never the raw token, token hash, credential
 * material, or authorization headers. NOT_ISSUED reports null timestamps
 * even when a disabled intake placeholder populated revocation metadata.
 */
export const staffValetSessionGuestAccessSchema = z
  .object({
    expiresAt: utcTimestampSchema.nullable(),
    revokedAt: utcTimestampSchema.nullable(),
    status: z.enum(["ACTIVE", "EXPIRED", "NOT_ISSUED", "REVOKED"]),
  })
  .strict();

export type StaffValetSessionGuestAccess = z.infer<
  typeof staffValetSessionGuestAccessSchema
>;

export const staffValetSessionDetailResponseSchema = z
  .object({
    checkIn: staffValetSessionCheckInSchema,
    guestAccess: staffValetSessionGuestAccessSchema,
    handoff: staffValetSessionHandoffSchema,
    keySlot: staffValetSessionKeySlotSchema.nullable(),
    locationId: uuidSchema,
    parking: staffValetSessionParkingSchema,
    sessionId: uuidSchema,
    state: staffValetSessionStateSchema,
    vehicle: staffValetSessionVehicleSchema,
    version: positiveVersionSchema,
  })
  .strict();

export type StaffValetSessionDetailResponse = z.infer<
  typeof staffValetSessionDetailResponseSchema
>;

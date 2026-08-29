import { z } from "zod";

import {
  checkInUtcTimestampSchema,
  checkInUuidSchema,
  confirmedPlateIdentitySchema,
  vehicleDetailLimits,
} from "./check-in-common.js";

export const returningVehicleRecognitionRequestSchema = z
  .object({
    targetLocationId: checkInUuidSchema,
    vehicleIdentity: confirmedPlateIdentitySchema.extend({
      confirmedByHuman: z.literal(true),
    }),
  })
  .strict();

const returningCustomerSuggestionSchema = z
  .object({
    customerId: checkInUuidSchema,
    displayName: z.string().nullable(),
    phoneSuffix: z.string().regex(/^[0-9]{1,4}$/),
  })
  .strict();

const recognizedVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateCountry: z.string(),
    plateNumberNormalized: z.string(),
    plateNumberRaw: z.string(),
    returningCustomer: returningCustomerSuggestionSchema.nullable(),
    vehicleId: checkInUuidSchema,
    vehicleUpdatedAt: checkInUtcTimestampSchema,
  })
  .strict();

export const returningVehicleRecognitionResponseSchema = z
  .object({ vehicle: recognizedVehicleSchema.nullable() })
  .strict();

function requiredVehicleDetail(maximumCodePoints: number) {
  return z
    .string()
    .transform((value) => value.trim().normalize("NFKC"))
    .refine(
      (value) =>
        value.length > 0 && Array.from(value).length <= maximumCodePoints,
    )
    .nullable();
}

export const vehicleDetailsCorrectionRequestSchema = z
  .object({
    color: requiredVehicleDetail(vehicleDetailLimits.colorCodePoints),
    expectedVehicleUpdatedAt: checkInUtcTimestampSchema,
    make: requiredVehicleDetail(vehicleDetailLimits.makeCodePoints),
    model: requiredVehicleDetail(vehicleDetailLimits.modelCodePoints),
  })
  .strict();

export const vehicleDetailsCorrectionResponseSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    mutationKind: z.enum(["NO_CHANGE", "UPDATED"]),
    valetSessionId: checkInUuidSchema,
    vehicleId: checkInUuidSchema,
    vehicleUpdatedAt: checkInUtcTimestampSchema,
  })
  .strict();

export type ReturningVehicleRecognitionRequest = z.infer<
  typeof returningVehicleRecognitionRequestSchema
>;
export type ReturningVehicleRecognitionResponse = z.infer<
  typeof returningVehicleRecognitionResponseSchema
>;
export type VehicleDetailsCorrectionRequest = z.infer<
  typeof vehicleDetailsCorrectionRequestSchema
>;
export type VehicleDetailsCorrectionResponse = z.infer<
  typeof vehicleDetailsCorrectionResponseSchema
>;

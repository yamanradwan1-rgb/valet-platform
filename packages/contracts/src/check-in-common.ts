import { z } from "zod";

export const checkInUuidSchema = z.string().uuid();
export const checkInUtcTimestampSchema = z.string().datetime({ offset: false });

const plateCandidateSchema = z
  .object({
    plateCountry: z.string().optional(),
    plateNumberRaw: z.string(),
    source: z.enum(["ANPR", "OCR"]),
  })
  .strict();

export const confirmedPlateIdentitySchema = z
  .object({
    confirmedByHuman: z.boolean(),
    mode: z.literal("CONFIRMED_PLATE"),
    plateCandidate: plateCandidateSchema.optional(),
    plateCountry: z.string(),
    plateNumberRaw: z.string(),
  })
  .strict();

export const temporaryVehicleIdentitySchema = z
  .object({
    mode: z.literal("TEMPORARY_DESCRIPTOR"),
    temporaryDescriptor: z.string(),
  })
  .strict();

export const vehicleIdentitySchema = z.discriminatedUnion("mode", [
  confirmedPlateIdentitySchema,
  temporaryVehicleIdentitySchema,
]);

export const vehicleDetailLimits = {
  colorCodePoints: 80,
  makeCodePoints: 80,
  modelCodePoints: 80,
} as const;

function normalizedDetail(maximumCodePoints: number) {
  return z
    .string()
    .transform((value) => value.trim().normalize("NFKC"))
    .refine(
      (value) =>
        value.length > 0 && Array.from(value).length <= maximumCodePoints,
    );
}

export const vehicleDetailsInputSchema = z
  .object({
    color: normalizedDetail(vehicleDetailLimits.colorCodePoints)
      .nullable()
      .optional(),
    make: normalizedDetail(vehicleDetailLimits.makeCodePoints)
      .nullable()
      .optional(),
    model: normalizedDetail(vehicleDetailLimits.modelCodePoints)
      .nullable()
      .optional(),
  })
  .strict();

export type ConfirmedPlateIdentity = z.infer<
  typeof confirmedPlateIdentitySchema
>;
export type VehicleDetailsInput = z.infer<typeof vehicleDetailsInputSchema>;

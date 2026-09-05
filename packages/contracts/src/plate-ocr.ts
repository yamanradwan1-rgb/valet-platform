import { z } from "zod";
import { checkInUuidSchema } from "./check-in-common.js";

export const PLATE_OCR_MAX_IMAGE_BYTES = 1024 * 1024;
export const plateOcrRequestSchema = z
  .object({
    targetLocationId: checkInUuidSchema,
    plateCountry: z.enum(["JO", "AE", "SA", "KW", "BH", "OTHER"]),
  })
  .strict();
export const plateOcrCandidateSchema = z
  .object({
    plateNumberRaw: z
      .string()
      .min(1)
      .max(40)
      .refine((value) => value.trim().length > 0),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();
export const plateOcrResponseSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("MATCH"), candidate: plateOcrCandidateSchema })
    .strict(),
  z.object({ status: z.literal("NO_MATCH") }).strict(),
  z.object({ status: z.literal("UNAVAILABLE") }).strict(),
]);
export type PlateOcrRequest = z.infer<typeof plateOcrRequestSchema>;
export type PlateOcrResponse = z.infer<typeof plateOcrResponseSchema>;

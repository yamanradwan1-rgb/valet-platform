import { z } from "zod";

const positiveVersionSchema = z.number().int().positive();
const uuidSchema = z.string().uuid();

export const confirmParkedRequestSchema = z
  .object({
    expectedSessionVersion: positiveVersionSchema,
    expectedTaskVersion: positiveVersionSchema,
    keySlotCode: z.string().trim().min(1),
    keySlotId: uuidSchema.optional(),
    parkingSpotCode: z.string().trim().min(1).optional(),
    parkingSpotId: uuidSchema.optional(),
    parkingZoneCode: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.parkingSpotCode === undefined) !==
      (value.parkingZoneCode === undefined),
    { message: "Exactly one parking resource code is required." },
  )
  .refine(
    (value) =>
      value.parkingSpotId === undefined || value.parkingSpotCode !== undefined,
    { message: "Parking Spot ID requires a Parking Spot code." },
  );

export const confirmParkedResponseSchema = z
  .object({
    parkedAt: z.string().datetime({ offset: false }),
    parkingSpotCode: z.string().min(1).nullable(),
    parkingSpotId: z.string().uuid().nullable(),
    parkingZoneId: z.string().uuid(),
    sessionId: z.string().uuid(),
    sessionVersion: positiveVersionSchema,
    state: z.literal("PARKED"),
    taskId: z.string().uuid(),
    taskStatus: z.literal("COMPLETED"),
    taskVersion: positiveVersionSchema,
  })
  .strict();

export type ConfirmParkedRequest = z.infer<typeof confirmParkedRequestSchema>;
export type ConfirmParkedResponse = z.infer<typeof confirmParkedResponseSchema>;

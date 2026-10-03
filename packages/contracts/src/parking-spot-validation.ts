import { z } from "zod";

const uuid = z.string().uuid();
const version = z.number().int().positive().safe();
const queryVersion = z.union([
  version,
  z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(version),
]);

export const parkingSpotValidationQuerySchema = z
  .object({
    taskId: uuid,
    expectedSessionVersion: queryVersion,
    expectedTaskVersion: queryVersion,
    expectedShiftId: uuid,
    parkingSpotCode: z.string().trim().min(1),
    parkingSpotId: uuid.optional(),
  })
  .strict();

/** Valid at this read only. No reservation or final binding guarantee. */
export const parkingSpotValidationResponseSchema = z
  .object({
    sessionId: uuid,
    taskId: uuid,
    sessionVersion: version,
    taskVersion: version,
    parkingSpotId: uuid,
    parkingSpotCode: z.string().min(1),
    parkingZoneId: uuid,
    available: z.literal(true),
  })
  .strict();

export type ParkingSpotValidationQuery = z.infer<
  typeof parkingSpotValidationQuerySchema
>;
export type ParkingSpotValidationResponse = z.infer<
  typeof parkingSpotValidationResponseSchema
>;

export const parkingSpotValidationSessionIdSchema = uuid;

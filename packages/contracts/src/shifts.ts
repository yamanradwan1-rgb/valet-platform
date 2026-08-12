import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

export const shiftProjectionSchema = z
  .object({
    endedAt: utcTimestampSchema.nullable(),
    locationId: uuidSchema,
    shiftId: uuidSchema,
    startedAt: utcTimestampSchema,
    status: z.enum(["ACTIVE", "ENDED"]),
  })
  .strict();

export const startShiftRequestSchema = z
  .object({ targetLocationId: uuidSchema })
  .strict();

export const endShiftRequestSchema = z.object({}).strict();

export const activeShiftQuerySchema = z
  .object({ locationId: uuidSchema })
  .strict();

export const startShiftResponseSchema = shiftProjectionSchema;
export const endShiftResponseSchema = shiftProjectionSchema;

export const activeShiftResponseSchema = z
  .object({ shift: shiftProjectionSchema.nullable() })
  .strict();

export type ShiftProjection = z.infer<typeof shiftProjectionSchema>;
export type StartShiftRequest = z.infer<typeof startShiftRequestSchema>;
export type ActiveShiftQuery = z.infer<typeof activeShiftQuerySchema>;

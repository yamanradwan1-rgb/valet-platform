import { z } from "zod";
import { shiftPresenceEvidenceSchema } from "./shift-presence-public.js";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });
const shiftMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/);
const signedShiftMoneySchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/);

export const shiftCashReconciliationSchema = z
  .object({
    cashExpected: shiftMoneySchema,
    cashReported: shiftMoneySchema,
    cashVariance: signedShiftMoneySchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    reportedAt: utcTimestampSchema,
  })
  .strict();

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
  .object({
    targetLocationId: uuidSchema,
    presence: shiftPresenceEvidenceSchema.optional(),
  })
  .strict();

export const endShiftRequestSchema = z
  .object({
    cashReported: shiftMoneySchema,
    presence: shiftPresenceEvidenceSchema.optional(),
  })
  .strict();

export const activeShiftQuerySchema = z
  .object({ locationId: uuidSchema })
  .strict();

export const startShiftResponseSchema = shiftProjectionSchema;
export const endShiftResponseSchema = shiftProjectionSchema.extend({
  cashReconciliation: shiftCashReconciliationSchema,
});

export const activeShiftResponseSchema = z
  .object({ shift: shiftProjectionSchema.nullable() })
  .strict();

export type ShiftProjection = z.infer<typeof shiftProjectionSchema>;
export type StartShiftRequest = z.infer<typeof startShiftRequestSchema>;
export type StartShiftResponse = z.infer<typeof startShiftResponseSchema>;
export type EndShiftRequest = z.infer<typeof endShiftRequestSchema>;
export type EndShiftResponse = z.infer<typeof endShiftResponseSchema>;
export type ActiveShiftQuery = z.infer<typeof activeShiftQuerySchema>;

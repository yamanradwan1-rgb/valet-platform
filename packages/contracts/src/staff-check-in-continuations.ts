import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

export const checkInContinuationsQuerySchema = z
  .object({
    locationId: uuidSchema,
  })
  .strict();

export type CheckInContinuationsQuery = z.infer<
  typeof checkInContinuationsQuerySchema
>;

export const staffCheckInContinuationVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateCountry: z.string().nullable(),
    plateNumberRaw: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
  })
  .strict();

export type StaffCheckInContinuationVehicle = z.infer<
  typeof staffCheckInContinuationVehicleSchema
>;

export const staffCheckInContinuationSummarySchema = z
  .object({
    createdAt: utcTimestampSchema,
    sessionId: uuidSchema,
    vehicle: staffCheckInContinuationVehicleSchema,
  })
  .strict();

export type StaffCheckInContinuationSummary = z.infer<
  typeof staffCheckInContinuationSummarySchema
>;

export const staffCheckInContinuationsResponseSchema = z
  .object({
    continuations: z.array(staffCheckInContinuationSummarySchema),
  })
  .strict();

export type StaffCheckInContinuationsResponse = z.infer<
  typeof staffCheckInContinuationsResponseSchema
>;

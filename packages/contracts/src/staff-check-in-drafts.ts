import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

export const checkInDraftsQuerySchema = z
  .object({
    locationId: uuidSchema,
  })
  .strict();

export type CheckInDraftsQuery = z.infer<typeof checkInDraftsQuerySchema>;

export const staffCheckInDraftVehicleSchema = z
  .object({
    color: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    plateCountry: z.string().nullable(),
    plateNumberRaw: z.string().nullable(),
    temporaryDescriptor: z.string().nullable(),
  })
  .strict();

export type StaffCheckInDraftVehicle = z.infer<
  typeof staffCheckInDraftVehicleSchema
>;

export const staffCheckInDraftSummarySchema = z
  .object({
    conditionCompletedAt: utcTimestampSchema.nullable(),
    createdAt: utcTimestampSchema,
    sessionId: uuidSchema,
    vehicle: staffCheckInDraftVehicleSchema,
  })
  .strict();

export type StaffCheckInDraftSummary = z.infer<
  typeof staffCheckInDraftSummarySchema
>;

export const staffCheckInDraftsResponseSchema = z
  .object({
    drafts: z.array(staffCheckInDraftSummarySchema),
  })
  .strict();

export type StaffCheckInDraftsResponse = z.infer<
  typeof staffCheckInDraftsResponseSchema
>;

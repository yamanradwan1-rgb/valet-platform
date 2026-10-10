import { z } from "zod";

import { overviewListResponse } from "./location-overview-pagination.js";
import { sessionOverviewEntrySchema } from "./location-overview.js";
import { sessionOverviewFilterSchema } from "./session-overview-query.js";

const historicalNameComponentSchema = z
  .string()
  .min(1)
  .refine((value) => Array.from(value).length <= 100, {
    message: "Historical staff names are limited to 100 Unicode code points.",
  })
  .refine((value) => value.trim() === value && value.trim().length > 0, {
    message: "Historical staff name must be a complete trimmed component.",
  });

export const historicalStaffNameSchema = z
  .object({
    firstName: historicalNameComponentSchema,
    lastName: historicalNameComponentSchema,
  })
  .strict();
export type HistoricalStaffName = z.infer<typeof historicalStaffNameSchema>;

export const parkingCompletionProofSchema = z.enum([
  "PROVEN",
  "NO_RECORD",
  "UNVERIFIABLE",
]);
export type ParkingCompletionProof = z.infer<
  typeof parkingCompletionProofSchema
>;

export const liveSessionOverviewEntrySchema = sessionOverviewEntrySchema
  .safeExtend({
    checkedInBy: historicalStaffNameSchema.nullable(),
    parkedBy: historicalStaffNameSchema.nullable(),
    parkingCompletionProof: parkingCompletionProofSchema,
  })
  .refine(
    (entry) =>
      entry.parkingCompletionProof === "PROVEN" || entry.parkedBy === null,
    {
      path: ["parkedBy"],
      message: "Unproven Parking cannot name a historical actor.",
    },
  );
export type LiveSessionOverviewEntry = z.infer<
  typeof liveSessionOverviewEntrySchema
>;
export const liveSessionOverviewListResponseSchema = overviewListResponse(
  liveSessionOverviewEntrySchema,
);

// Separate cursor domain: old /overview/sessions cursors never enter this route.
export const liveSessionOverviewCursorSchema = z
  .object({
    v: z.literal(3),
    d: z.literal("live-sessions"),
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    filter: sessionOverviewFilterSchema,
    sortKey: z.string().datetime({ offset: true }),
    tiebreakerId: z.string().uuid(),
  })
  .strict();

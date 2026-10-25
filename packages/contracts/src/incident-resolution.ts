import { z } from "zod";
import { overviewListQuerySchema } from "./location-overview-pagination.js";

export const incidentListFilterSchema = z.enum(["ALL", "ACTIVE", "RESOLVED"]);
export const incidentListQuerySchema = overviewListQuerySchema
  .extend({
    filter: incidentListFilterSchema.default("ALL"),
  })
  .strict();
export const incidentResolutionRequestSchema = z
  .object({
    operationId: z.string().uuid(),
    expectedStatus: z.enum(["OPEN", "INVESTIGATING"]),
    resolutionNotes: z.string().trim().min(1).max(1000),
  })
  .strict();
export type IncidentListFilter = z.infer<typeof incidentListFilterSchema>;
export type IncidentResolutionRequest = z.infer<
  typeof incidentResolutionRequestSchema
>;

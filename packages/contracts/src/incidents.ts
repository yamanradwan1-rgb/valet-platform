import { z } from "zod";

const uuidSchema = z.string().uuid();
const utcTimestampSchema = z.string().datetime({ offset: false });

/**
 * Canonical Blueprint incident categories for the basic MVP reporting flow.
 * Deliberately NOT the prototype's ad-hoc labels.
 */
export const incidentTypeSchema = z.enum([
  "VEHICLE_DAMAGE",
  "KEY_MISSING",
  "WRONG_KEY",
  "KEY_DAMAGED",
  "KEY_LOCKED_INSIDE",
  "UNAUTHORIZED_ZONE_EXIT",
  "WRONG_VEHICLE_HANDOFF_ATTEMPT",
  "PAYMENT_DISPUTE",
  "CUSTOMER_COMPLAINT",
  "EMPLOYEE_SAFETY",
  "SYSTEM_CONNECTION",
  "OTHER",
]);

export const incidentSeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

/**
 * Client-generated stable submission identity. The same id with the same
 * normalized payload returns the original report; reuse against a different
 * payload conflicts instead of duplicating.
 */
export const reportIncidentRequestSchema = z
  .object({
    incidentId: uuidSchema,
    severity: incidentSeveritySchema,
    type: incidentTypeSchema,
    description: z.string().trim().min(1).max(500),
  })
  .strict();

export const reportIncidentResponseSchema = z
  .object({
    createdAt: utcTimestampSchema,
    incidentId: uuidSchema,
    reportedByMembershipId: uuidSchema,
    sessionId: uuidSchema,
    severity: incidentSeveritySchema,
    status: z.literal("OPEN"),
    type: incidentTypeSchema,
  })
  .strict();

export type IncidentType = z.infer<typeof incidentTypeSchema>;
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;
export type ReportIncidentRequest = z.infer<
  typeof reportIncidentRequestSchema
>;
export type ReportIncidentResponse = z.infer<
  typeof reportIncidentResponseSchema
>;

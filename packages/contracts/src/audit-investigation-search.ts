import { z } from "zod";
import { staffValetSessionStateSchema } from "./staff-valet-session.js";
import {
  auditInvestigationCoverageSchema,
  auditInvestigationCurrentLabelSchema,
  auditInvestigationCursorSchema,
  auditInvestigationParticipationRoleSchema,
  auditInvestigationSourceSchema,
  auditInvestigationUtcSchema,
  auditInvestigationUuidSchema,
} from "./audit-investigation-common.js";

/** [from,to) is a UTC instant window, not a local/browser-time comparison.
 * U01: same Session AND predicates, independently matched historical witnesses.
 * U03: make/model/plate filters use live-current values, not event snapshots.
 */
export const auditInvestigationSearchQuerySchema = z.object({
  from: auditInvestigationUtcSchema,
  to: auditInvestigationUtcSchema,
  sessionId: auditInvestigationUuidSchema.optional(),
  keySlotId: auditInvestigationUuidSchema.optional(),
  membershipId: auditInvestigationUuidSchema.optional(),
  plateCountry: z.string().trim().min(1).max(8)
    .regex(/^[A-Z0-9_-]+$/).optional(),
  plate: z.string().trim().min(1).max(32).optional(),
  make: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: auditInvestigationCursorSchema.optional(),
}).strict().refine((query) => {
  const elapsed = Date.parse(query.to) - Date.parse(query.from);
  return elapsed > 0 && elapsed <= 31 * 24 * 60 * 60_000;
}, "Search requires a positive UTC window of at most 31 elapsed days");

export const auditInvestigationCurrentVehicleSchema = z.object({
  make: auditInvestigationCurrentLabelSchema,
  model: auditInvestigationCurrentLabelSchema,
  plate: auditInvestigationCurrentLabelSchema,
  plateCountry: auditInvestigationCurrentLabelSchema,
  temporaryDescriptor: auditInvestigationCurrentLabelSchema,
}).strict();
export const auditInvestigationCurrentKeySlotSchema = z.object({
  keySlotId: auditInvestigationUuidSchema.nullable(),
  code: auditInvestigationCurrentLabelSchema,
}).strict();
export const auditInvestigationMatchReasonSchema = z.object({
  source: auditInvestigationSourceSchema,
  eventId: auditInvestigationUuidSchema,
  matchedBy: z.enum(["KEY_SLOT", "EMPLOYEE", "WINDOW"]),
  participationRole: auditInvestigationParticipationRoleSchema.optional(),
}).strict().superRefine((reason, context) => {
  if (reason.participationRole && reason.matchedBy !== "EMPLOYEE") {
    context.addIssue({
      code: "custom", message: "Only employee matches have a participation role",
    });
  }
});

export const auditInvestigationSearchItemSchema = z.object({
  sessionId: auditInvestigationUuidSchema,
  currentVehicle: auditInvestigationCurrentVehicleSchema,
  currentKeySlot: auditInvestigationCurrentKeySlotSchema,
  currentState: staffValetSessionStateSchema,
  currentStateBasis: z.literal("CURRENT"),
  firstMatchedAt: auditInvestigationUtcSchema,
  lastMatchedAt: auditInvestigationUtcSchema,
  matchingRecordCount: z.number().int().min(1).max(100_000),
  matchReasons: z.array(auditInvestigationMatchReasonSchema).min(1).max(100),
  hasVisibleIncident: z.boolean(),
  matchedIncidentCount: z.number().int().nonnegative().max(100_000),
  coverage: auditInvestigationCoverageSchema,
}).strict().refine((item) =>
  Date.parse(item.firstMatchedAt) <= Date.parse(item.lastMatchedAt),
{ message: "Match bounds must be chronological" });

export const auditInvestigationSearchResponseSchema = z.object({
  items: z.array(auditInvestigationSearchItemSchema).max(100),
  nextCursor: auditInvestigationCursorSchema.nullable(),
  snapshotAt: auditInvestigationUtcSchema,
  semanticsVersion: z.literal(1),
  coverage: auditInvestigationCoverageSchema,
}).strict();

export type AuditInvestigationSearchQuery = z.infer<typeof auditInvestigationSearchQuerySchema>;
export type AuditInvestigationSearchResponse = z.infer<typeof auditInvestigationSearchResponseSchema>;
export type AuditInvestigationSearchItem = z.infer<typeof auditInvestigationSearchItemSchema>;
export type AuditInvestigationMatchReason = z.infer<typeof auditInvestigationMatchReasonSchema>;

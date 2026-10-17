import { z } from "zod";
import { staffValetSessionStateSchema } from "./staff-valet-session.js";
import {
  auditInvestigationCoverageSchema,
  auditInvestigationCursorSchema,
  auditInvestigationEvidenceQualitySchema,
  auditInvestigationParticipationSchema,
  auditInvestigationReferenceSchema,
  auditInvestigationRelatedEvidenceSchema,
  auditInvestigationSafePersonSchema,
  auditInvestigationTimelineKeySchema,
  auditInvestigationUtcSchema,
  auditInvestigationUuidSchema,
} from "./audit-investigation-common.js";
import {
  auditInvestigationCurrentKeySlotSchema,
  auditInvestigationCurrentVehicleSchema,
} from "./audit-investigation-search.js";

/** U04: one canonical (source,eventId) per recorded event, ordered by
 * (occurredAt ASC, source rank AUDIT=0, KEY=1, DISPATCH=2, INCIDENT=3, UUID).
 * Chronological display is not a causal or complete-custody assertion.
 */
export const auditInvestigationTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: auditInvestigationCursorSchema.optional(),
}).strict();

export const auditInvestigationTimelineEventSchema = z.object({
  key: auditInvestigationTimelineKeySchema,
  occurredAt: auditInvestigationUtcSchema,
  recordedAt: auditInvestigationUtcSchema.optional(),
  kind: z.string().min(2).max(100).regex(/^[A-Z][A-Z0-9_]+$/),
  quality: auditInvestigationEvidenceQualitySchema,
  actor: auditInvestigationSafePersonSchema.nullable(),
  participants: z.array(auditInvestigationParticipationSchema).max(4),
  references: z.array(auditInvestigationReferenceSchema).max(6),
  relatedEvidence: z.array(auditInvestigationRelatedEvidenceSchema).max(8),
}).strict();

export const auditInvestigationTimelineSessionSchema = z.object({
  sessionId: auditInvestigationUuidSchema,
  currentState: staffValetSessionStateSchema,
  currentStateBasis: z.literal("CURRENT"),
  currentVehicle: auditInvestigationCurrentVehicleSchema,
  currentKeySlot: auditInvestigationCurrentKeySlotSchema,
}).strict();

export const auditInvestigationDiscoveryContextSchema = z.object({
  from: auditInvestigationUtcSchema,
  to: auditInvestigationUtcSchema,
  matchedKeys: z.array(auditInvestigationTimelineKeySchema).max(100),
}).strict().refine((context) => Date.parse(context.from) < Date.parse(context.to));

export const auditInvestigationTimelineResponseSchema = z.object({
  session: auditInvestigationTimelineSessionSchema,
  items: z.array(auditInvestigationTimelineEventSchema).max(100),
  nextCursor: auditInvestigationCursorSchema.nullable(),
  snapshotAt: auditInvestigationUtcSchema,
  order: z.literal("ASC"),
  coverage: auditInvestigationCoverageSchema,
  discoveryContext: auditInvestigationDiscoveryContextSchema.optional(),
}).strict();

export type AuditInvestigationTimelineQuery = z.infer<typeof auditInvestigationTimelineQuerySchema>;
export type AuditInvestigationTimelineEvent = z.infer<typeof auditInvestigationTimelineEventSchema>;
export type AuditInvestigationTimelineResponse = z.infer<typeof auditInvestigationTimelineResponseSchema>;
export type AuditInvestigationTimelineSession = z.infer<typeof auditInvestigationTimelineSessionSchema>;

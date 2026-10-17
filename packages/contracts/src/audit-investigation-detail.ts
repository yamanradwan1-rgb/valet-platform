import { z } from "zod";
import { incidentSeveritySchema, incidentTypeSchema } from "./incidents.js";
import {
  auditInvestigationEvidenceQualitySchema,
  auditInvestigationParticipationSchema,
  auditInvestigationReferenceSchema,
  auditInvestigationRelatedEvidenceSchema,
  auditInvestigationSafePersonSchema,
  auditInvestigationTimelineKeySchema,
  auditInvestigationUtcSchema,
  auditInvestigationUuidSchema,
  auditInvestigationSourceSchema,
} from "./audit-investigation-common.js";

export const auditInvestigationDetailParamsSchema = z.object({
  sessionId: auditInvestigationUuidSchema,
  source: auditInvestigationSourceSchema,
  eventId: auditInvestigationUuidSchema,
}).strict();

const eventDetailBase = {
  key: auditInvestigationTimelineKeySchema,
  sessionId: auditInvestigationUuidSchema,
  occurredAt: auditInvestigationUtcSchema,
  recordedAt: auditInvestigationUtcSchema.optional(),
  quality: auditInvestigationEvidenceQualitySchema,
  actor: auditInvestigationSafePersonSchema.nullable(),
  participants: z.array(auditInvestigationParticipationSchema).max(4),
  references: z.array(auditInvestigationReferenceSchema).max(6),
  relatedEvidence: z.array(auditInvestigationRelatedEvidenceSchema).max(8),
} as const;

/** Source discriminant is server validated against URL and actual scoped row.
 * Unknown Audit kinds expose only known-safe common fields; never metadata.
 */
export const auditInvestigationEventDetailSchema = z.discriminatedUnion("source", [
  z.object({
    ...eventDetailBase, source: z.literal("AUDIT"),
    kind: z.string().min(2).max(100).regex(/^[A-Z][A-Z0-9_]+$/),
    outcome: z.enum(["RECORDED", "VERIFIED", "FAILED"]).optional(),
  }).strict(),
  z.object({
    ...eventDetailBase, source: z.literal("KEY_CUSTODY"),
    kind: z.enum(["SLOT_ASSIGNED", "SLOT_CLEARED", "CHECKED_OUT", "RETURNED_TO_SLOT", "RELEASED"]),
    // RELEASED may legitimately be unbound (DB slot-required CHECK excludes it).
    keySlotId: auditInvestigationUuidSchema.nullable(),
  }).strict(),
  z.object({
    ...eventDetailBase, source: z.literal("DISPATCH"),
    kind: z.enum(["QUEUED", "ASSIGNED", "REASSIGNED", "ACCEPTED", "DECLINED",
      "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
    taskId: auditInvestigationUuidSchema,
  }).strict(),
  z.object({
    ...eventDetailBase, source: z.literal("INCIDENT"),
    kind: z.literal("INCIDENT_REPORTED"),
    incident: z.object({
      type: incidentTypeSchema,
      severity: incidentSeveritySchema,
      status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]),
      statusBasis: z.literal("CURRENT"),
      resolutionAvailable: z.boolean(),
    }).strict(),
  }).strict(),
]).superRefine((detail, context) => {
  if (detail.key.source !== detail.source) {
    context.addIssue({ code: "custom", message: "Detail key source must match discriminator" });
  }
  if (detail.source === "KEY_CUSTODY" && detail.kind !== "RELEASED" &&
      detail.keySlotId === null) {
    context.addIssue({ code: "custom", message: "This custody kind requires a recorded slot" });
  }
});

export type AuditInvestigationDetailParams = z.infer<typeof auditInvestigationDetailParamsSchema>;
export type AuditInvestigationEventDetail = z.infer<typeof auditInvestigationEventDetailSchema>;

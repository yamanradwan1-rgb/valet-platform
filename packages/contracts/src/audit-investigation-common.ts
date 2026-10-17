import { z } from "zod";

/** Issue #300 purpose-only contracts. Caller authority is always server-derived. */
export const auditInvestigationUuidSchema = z.string().uuid();
export const auditInvestigationUtcSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  .refine((value) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return false;
    const canonical = date.toISOString();
    return canonical.slice(0, 19) === value.slice(0, 19);
  }, "Must be a real UTC instant with millisecond-or-lower precision");
export const auditInvestigationCursorSchema = z.string()
  .min(8).max(4096).regex(/^[A-Za-z0-9_-]+$/);
export const auditInvestigationSourceSchema = z.enum([
  "AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT",
]);
export const auditInvestigationEvidenceQualitySchema = z.enum([
  "RECORDED", "PARTIAL", "UNVERIFIABLE",
]);
export const auditInvestigationParticipationRoleSchema = z.enum([
  "ACTOR", "PREVIOUS_ASSIGNEE", "NEW_ASSIGNEE", "REPORTER",
]);
export const auditInvestigationCurrentLabelSchema = z.object({
  value: z.string().trim().min(1).max(201).nullable(),
  basis: z.literal("CURRENT"),
  unavailable: z.boolean(),
}).strict().refine(
  (label) => label.unavailable === (label.value === null),
  "Unavailable must reflect missing current value",
);
export const auditInvestigationSafePersonSchema = z.object({
  membershipId: auditInvestigationUuidSchema,
  currentDisplayName: z.string().trim().min(3).max(201).nullable(),
}).strict();
export const auditInvestigationParticipationSchema = z.object({
  role: auditInvestigationParticipationRoleSchema,
  membership: auditInvestigationSafePersonSchema.nullable(),
}).strict();
export const auditInvestigationTimelineKeySchema = z.object({
  source: auditInvestigationSourceSchema,
  eventId: auditInvestigationUuidSchema,
}).strict();
export const auditInvestigationReferenceSchema = z.object({
  kind: z.enum(["SESSION", "TASK", "KEY_SLOT", "VEHICLE", "INCIDENT"]),
  id: auditInvestigationUuidSchema,
}).strict();
export const auditInvestigationRelatedEvidenceSchema = z.object({
  key: auditInvestigationTimelineKeySchema,
  basis: z.enum(["VERIFIED_TASK", "VERIFIED_INCIDENT", "VERIFIED_SESSION"]),
}).strict();
export const auditInvestigationCoverageStatusSchema = z.enum([
  "AVAILABLE", "PARTIAL", "NOT_SUPPORTED", "NOT_AUTHORIZED", "UNAVAILABLE",
]);
const sourceCoverage = z.object({
  status: auditInvestigationCoverageStatusSchema,
  reason: z.enum([
    "HISTORICAL_NOT_RECORDED", "DETAIL_RESTRICTED",
    "SOURCE_UNAVAILABLE", "INTEGRITY_ANOMALY",
  ]).optional(),
}).strict();
export const auditInvestigationCoverageSchema = z.object({
  AUDIT: sourceCoverage,
  KEY_CUSTODY: sourceCoverage,
  DISPATCH: sourceCoverage,
  INCIDENT: sourceCoverage,
}).strict();

/** Never parse as HTTP query/body: authorized by W4 from current staff session. */
export const auditInvestigationReadScopeSchema = z.object({
  organizationId: auditInvestigationUuidSchema,
  locationId: auditInvestigationUuidSchema,
  membershipId: auditInvestigationUuidSchema,
  role: z.enum(["ORG_ADMIN", "LOCATION_MANAGER"]),
}).strict();

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const cursorBase = {
  version: z.literal(1),
  organizationId: auditInvestigationUuidSchema,
  locationId: auditInvestigationUuidSchema,
  viewerSessionDigest: digest,
  filterDigest: digest,
  snapshotAt: auditInvestigationUtcSchema,
  databaseSnapshot: z.string().min(3).max(512)
    .regex(/^\d+:\d+:(?:\d+(?:,\d+)*)?$/),
  issuedAt: auditInvestigationUtcSchema,
  expiresAt: auditInvestigationUtcSchema,
} as const;
export const auditInvestigationCursorPayloadSchema = z.discriminatedUnion("purpose", [
  z.object({
    ...cursorBase, purpose: z.literal("SEARCH_SESSIONS"),
    last: z.object({
      lastMatchedAt: auditInvestigationUtcSchema,
      sessionId: auditInvestigationUuidSchema,
    }).strict(),
  }).strict(),
  z.object({
    ...cursorBase, purpose: z.literal("SESSION_TIMELINE"),
    sessionId: auditInvestigationUuidSchema,
    last: z.object({
      occurredAt: auditInvestigationUtcSchema,
      sourceRank: z.number().int().min(0).max(3),
      eventId: auditInvestigationUuidSchema,
    }).strict(),
  }).strict(),
]).refine((payload) => {
  const issued = Date.parse(payload.issuedAt);
  const expiry = Date.parse(payload.expiresAt);
  return expiry > issued && expiry - issued <= 15 * 60_000;
}, "Cursor lifetime must be positive and at most 15 minutes");

/** Cursor payload is HMAC authenticated with purpose/domain separation, not encrypted.
 * Bind viewer's exact active staff session, Location/Organization, normalized
 * filters, immutable snapshot and keyset. Reauthorize every subsequent GET.
 * Never put PII/filter text, credentials or raw metadata in the signed payload.
 */
export type AuditInvestigationSource = z.infer<typeof auditInvestigationSourceSchema>;
export type AuditInvestigationCoverage = z.infer<typeof auditInvestigationCoverageSchema>;
export type AuditInvestigationReadScope = z.infer<typeof auditInvestigationReadScopeSchema>;
export type AuditInvestigationCursorPayload = z.infer<typeof auditInvestigationCursorPayloadSchema>;
export type AuditInvestigationCurrentLabel = z.infer<typeof auditInvestigationCurrentLabelSchema>;
export type AuditInvestigationTimelineKey = z.infer<typeof auditInvestigationTimelineKeySchema>;

import { z } from "zod";
import {
  auditInvestigationCurrentLabelSchema,
  auditInvestigationCursorSchema,
  auditInvestigationUuidSchema,
} from "./audit-investigation-common.js";

/** U06 canonical selector IDs, including permitted inactive historical resources.
 * No email/phone/current grant or wildcard directory search. The exact Location
 * comes from the W4 server-authorized route and is never a query override.
 */
export const auditInvestigationFilterKindSchema = z.enum(["MEMBER", "KEY_SLOT"]);
export const auditInvestigationFilterQuerySchema = z.object({
  kind: auditInvestigationFilterKindSchema,
  text: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
  cursor: auditInvestigationCursorSchema.optional(),
}).strict();
export const auditInvestigationFilterItemSchema = z.object({
  id: auditInvestigationUuidSchema,
  currentLabel: auditInvestigationCurrentLabelSchema,
}).strict();
export const auditInvestigationFilterResponseSchema = z.object({
  kind: auditInvestigationFilterKindSchema,
  items: z.array(auditInvestigationFilterItemSchema).max(20),
  nextCursor: auditInvestigationCursorSchema.nullable(),
  hasMore: z.boolean(),
}).strict().refine((response) =>
  !response.nextCursor || response.hasMore, "Continuation implies more results");

export type AuditInvestigationFilterQuery = z.infer<typeof auditInvestigationFilterQuerySchema>;
export type AuditInvestigationFilterResponse = z.infer<typeof auditInvestigationFilterResponseSchema>;

import {
  auditInvestigationSearchQuerySchema,
  type AuditInvestigationSearchQuery,
} from "@valet/contracts";

/**
 * The W1 schema is the sole HTTP query contract. In particular, filter values
 * for a historic Key Slot and employee are canonical UUIDs, never the visible
 * slot code or a current employee display name.
 *
 * Callers must resolve location-local date/time to UTC using an authoritative
 * Location timezone and settle DST ambiguity BEFORE using this function.
 */
export function validateInvestigationSearchQuery(
  input: unknown,
): AuditInvestigationSearchQuery {
  return auditInvestigationSearchQuerySchema.parse(input);
}

export function changeInvestigationSearchPage(
  query: AuditInvestigationSearchQuery,
  cursor: string | null,
): AuditInvestigationSearchQuery {
  const { cursor: _old, ...base } = query;
  void _old;
  return validateInvestigationSearchQuery({
    ...base,
    ...(cursor ? { cursor } : {}),
  });
}

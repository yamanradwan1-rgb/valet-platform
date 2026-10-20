import {
  auditInvestigationFilterQuerySchema,
  auditInvestigationFilterResponseSchema,
  auditInvestigationSearchResponseSchema,
  type AuditInvestigationFilterQuery,
  type AuditInvestigationFilterResponse,
  type AuditInvestigationSearchQuery,
  type AuditInvestigationSearchResponse,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import type { InvestigationSearchScope } from "./investigation-search-scope";
import { validateInvestigationSearchScope } from "./investigation-search-scope";
import { validateInvestigationSearchQuery } from "./investigation-search-query";

export interface InvestigationSearchTransport {
  readonly api: Pick<DashboardApiClient, "request">;
  readonly scope: InvestigationSearchScope;
  readonly signal: AbortSignal;
  /**
   * Auth refresh changes session identity/generation while a read is pending:
   * the orchestrator MUST clear old results and require a re-proven scope.
   */
  readonly onAuthReconciled: () => void;
}

function exactLocationPath(scope: InvestigationSearchScope): string {
  const valid = validateInvestigationSearchScope(scope);
  return [
    "/v1/staff/management/organizations",
    encodeURIComponent(valid.organizationId),
    "locations",
    encodeURIComponent(valid.locationId),
    "audit-investigations",
  ].join("/");
}

/** No-store, authenticated, single-Location search, parsed by W1 Zod schema. */
export function readInvestigationSessions(
  context: InvestigationSearchTransport,
  query: AuditInvestigationSearchQuery,
): Promise<AuditInvestigationSearchResponse> {
  if (context.signal.aborted) return Promise.reject(context.signal.reason);
  const safeQuery = validateInvestigationSearchQuery(query);
  return context.api.request(
    `${exactLocationPath(context.scope)}/sessions`,
    auditInvestigationSearchResponseSchema,
    {
      method: "GET",
      query: safeQuery,
      signal: context.signal,
      onAuthReconciled: context.onAuthReconciled,
    },
  );
}

/** Canonical scoped ID suggestions, including historical inactive labels. */
export function readInvestigationSearchFilters(
  context: InvestigationSearchTransport,
  query: AuditInvestigationFilterQuery,
): Promise<AuditInvestigationFilterResponse> {
  if (context.signal.aborted) return Promise.reject(context.signal.reason);
  const safeQuery = auditInvestigationFilterQuerySchema.parse(query);
  return context.api.request(
    `${exactLocationPath(context.scope)}/filters`,
    auditInvestigationFilterResponseSchema,
    {
      method: "GET",
      query: safeQuery,
      signal: context.signal,
      onAuthReconciled: context.onAuthReconciled,
    },
  );
}

import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  auditInvestigationFilterQuerySchema,
  auditInvestigationFilterResponseSchema,
  auditInvestigationSearchQuerySchema,
  auditInvestigationSearchResponseSchema,
  type AuditInvestigationFilterQuery,
  type AuditInvestigationSearchQuery,
} from "@valet/contracts";
import type { PostgresPool, PostgresTransaction } from "../../../../common/database/postgres";
import { inPostgresTransaction } from "../../../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../../../common/http/api-errors";
import { recordAdminActivityInTransaction } from "../../../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../../../auth/staff-session-context";
import { normalizePlateNumber } from "../../../vehicles/vehicle-identity-command";
import { captureManagementPaginationSnapshot } from "../../management-pagination-snapshot";
import { bindInvestigationCursor, decodeInvestigationCursor,
  encodeInvestigationCursor, type InvestigationCursorBinding } from "../audit-investigation-cursor";
import { requireU05StableIndirectCohort } from "../audit-investigation-u05-indirect-guard";
import { readU05IncidentPolicy } from "../audit-investigation-u05-policy";
import { authorizeAuditInvestigationLocation } from "../security/audit-investigation-authorization";
import {
  projectAuditInvestigationSearchItem,
  queryAuditInvestigationLocationIntegrity,
  queryAuditInvestigationFirstPage,
  type NormalizedSearch,
  type SearchSnapshot,
} from "./search-page-query";
import { listAuditInvestigationFilterOptions } from "./search-selector-query";
import { requireCanonicalInvestigationSelectors } from "./search-selector-authorization";
import { decodeMemberSelectorCursor, encodeMemberSelectorCursor } from "./search-selector-cursor";

function literalPrefix(value: string | undefined): string | null {
  return value === undefined ? null : value.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%";
}

export function normalizedInvestigationSearch(query: AuditInvestigationSearchQuery): NormalizedSearch {
  let plate: string | null = null;
  if (query.plate !== undefined) {
    try {
      plate = normalizePlateNumber(query.plate).plateNumberNormalized;
    } catch {
      throw new ApiTransportValidationError();
    }
  }
  return {
    plate,
    plateCountry: query.plateCountry?.trim().normalize("NFKC").toUpperCase() ?? null,
    makePrefix: literalPrefix(query.make),
    modelPrefix: literalPrefix(query.model),
  };
}

export class InvestigationSnapshotPaginationUnavailable extends ServiceUnavailableException {
  readonly code = "AUDIT_INVESTIGATION_SNAPSHOT_UNAVAILABLE" as const;
  constructor() {
    super("Investigation pagination awaits verified four-source insertion fencing.");
  }
}

/** Called only with a W4-derived scope in the SAME transaction. */
export async function searchAuditInvestigationSessions(
  tx: PostgresTransaction,
  scope: Awaited<ReturnType<typeof authorizeAuditInvestigationLocation>>,
  query: AuditInvestigationSearchQuery,
  snapshot: SearchSnapshot,
  binding?: InvestigationCursorBinding,
  after?: { readonly lastMatchedAt: string; readonly sessionId: string },
  originalTimes?: { readonly issuedAt: string; readonly expiresAt: string },
) {
  const rows = await queryAuditInvestigationFirstPage(
    tx, scope, query, normalizedInvestigationSearch(query), snapshot, after,
  );
  const hasMore = rows.length > query.limit;
  // Mutable current vehicle labels are not protected by event insertion-XID.
  // Until a verified identity revision/restart oracle exists, a continuation
  // with vehicle filters could omit/duplicate Sessions. Keep THAT lane closed.
  const mutableVehicleFilter = Boolean(query.make || query.model || query.plate || query.plateCountry);
  // Refuse both cursor issuance AND any continuation for mutable labels. A
  // signed filter digest cannot attest historical vehicle-filter membership.
  if ((hasMore && !binding) || (mutableVehicleFilter && (hasMore || after)))
    throw new InvestigationSnapshotPaginationUnavailable();
  if (hasMore && snapshot.database.length > 512)
    throw new InvestigationSnapshotPaginationUnavailable();
  // Ordinary production pagination is allowed only for cohorts that pass the
  // independently enforced historical indirect-association veto. Signed-only
  // Owner proof remains an optional test certificate, not an access flag.
  if (binding && (hasMore || after)) {
    try {
      await requireU05StableIndirectCohort(tx, scope, snapshot,
        { from: query.from, to: query.to });
    } catch {
      throw new InvestigationSnapshotPaginationUnavailable();
    }
  }
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const issuedAt = originalTimes?.issuedAt ?? new Date().toISOString();
  const expiresAt = originalTimes?.expiresAt ??
    new Date(Date.parse(issuedAt) + 15 * 60_000).toISOString();
  const nextCursor = hasMore && binding && last
    ? encodeInvestigationCursor(binding, {
        version: 1, purpose: "SEARCH_SESSIONS",
        organizationId: binding.organizationId,
        locationId: binding.locationId,
        viewerSessionDigest: binding.viewerSessionDigest,
        filterDigest: binding.filterDigest,
        snapshotAt: snapshot.now.toISOString(),
        snapshotCutoff: snapshot.cutoff,
        databaseSnapshot: snapshot.database,
        issuedAt, expiresAt,
        last: { lastMatchedAt: last.lastMatchedAtCursor, sessionId: last.sessionId },
      }) : null;
  // Empty searches still report correct source authorization coverage.
  const incidentAvailable = page.length > 0
    ? page.every((row) => row.incidentAvailable)
    : (await tx.query<{ active: boolean }>(
        `SELECT status = 'ACTIVE' AS active FROM locations
         WHERE organization_id = $1::uuid AND id = $2::uuid`,
        [scope.organizationId, scope.locationId],
      )).rows[0]?.active === true;
  const hasAuditIntegrityAnomaly = await queryAuditInvestigationLocationIntegrity(
    tx, scope, query, snapshot,
  );
  const available = { status: "AVAILABLE" as const };
  return auditInvestigationSearchResponseSchema.parse({
    items: page.map(projectAuditInvestigationSearchItem),
    nextCursor,
    snapshotAt: snapshot.now.toISOString(),
    semanticsVersion: 1,
    coverage: {
      AUDIT: hasAuditIntegrityAnomaly
        ? { status: "PARTIAL", reason: "INTEGRITY_ANOMALY" } : available,
      KEY_CUSTODY: available, DISPATCH: available,
      INCIDENT: incidentAvailable ? available : {
        status: "NOT_AUTHORIZED", reason: "DETAIL_RESTRICTED",
      },
    },
  });
}

@Injectable()
export class AuditInvestigationSearchService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  search(context: StaffSessionContext, organizationId: string, locationId: string,
    raw: AuditInvestigationSearchQuery) {
    const parsed = auditInvestigationSearchQuerySchema.safeParse(raw);
    if (!parsed.success) throw new ApiTransportValidationError();
    return inPostgresTransaction(this.pool, async (tx) => {
      const scope = await authorizeAuditInvestigationLocation(tx, context, organizationId, locationId);
      await requireCanonicalInvestigationSelectors(tx, scope, parsed.data);
      const normalized = normalizedInvestigationSearch(parsed.data);
      // Current Location policy is security-relevant for Incident visibility.
      // Bind it into every production cursor to invalidate continuation after
      // a Location activation/revocation change; never rely on a test lease.
      const incidentPolicy = await readU05IncidentPolicy(tx, scope);
      const binding = bindInvestigationCursor({
        context, scope, purpose: "SEARCH_SESSIONS",
        normalizedFilters: {
          from: parsed.data.from, to: parsed.data.to,
          sessionId: parsed.data.sessionId ?? null,
          keySlotId: parsed.data.keySlotId ?? null,
          membershipId: parsed.data.membershipId ?? null,
          ...normalized,
          incidentPolicy,
        },
      });
      const cursor = decodeInvestigationCursor(parsed.data.cursor, binding);
      const current = cursor === null
        ? await captureManagementPaginationSnapshot(tx)
        : { now: new Date(cursor.snapshotAt),
            cutoff: cursor.snapshotCutoff, snapshot: cursor.databaseSnapshot };
      const result = await searchAuditInvestigationSessions(tx, scope, parsed.data, {
        now: current.now, cutoff: current.cutoff, database: current.snapshot,
      }, binding, cursor?.purpose === "SEARCH_SESSIONS" ? cursor.last : undefined,
      cursor ? { issuedAt: cursor.issuedAt, expiresAt: cursor.expiresAt } : undefined);
      if (scope.role === "ORG_ADMIN") await recordAdminActivityInTransaction(tx, context);
      return result;
    });
  }

  filters(context: StaffSessionContext, organizationId: string, locationId: string,
    raw: AuditInvestigationFilterQuery) {
    const parsed = auditInvestigationFilterQuerySchema.safeParse(raw);
    if (!parsed.success) throw new ApiTransportValidationError();
    if (parsed.data.kind !== "MEMBER" && parsed.data.cursor !== undefined)
      throw new ApiTransportValidationError();
    return inPostgresTransaction(this.pool, async (tx) => {
      const scope = await authorizeAuditInvestigationLocation(tx, context, organizationId, locationId);
      const binding = { scope, context, text: parsed.data.text };
      const after = parsed.data.cursor
        ? decodeMemberSelectorCursor(binding, parsed.data.cursor) : null;
      const page = await listAuditInvestigationFilterOptions(tx, scope, parsed.data, after);
      const lastId = page.items.at(-1)?.id;
      if (page.hasMore && parsed.data.kind === "MEMBER" && !lastId)
        throw new ApiTransportValidationError();
      const result = auditInvestigationFilterResponseSchema.parse({
        ...page,
        nextCursor: parsed.data.kind === "MEMBER" && page.hasMore && lastId
          ? encodeMemberSelectorCursor(binding, lastId) : null,
      });
      if (scope.role === "ORG_ADMIN") await recordAdminActivityInTransaction(tx, context);
      return result;
    });
  }
}

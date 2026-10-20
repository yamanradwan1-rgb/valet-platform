import { describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  auditInvestigationIntegritySql,
  queryAuditInvestigationLocationIntegrity,
} from "../src/modules/management/audit-investigation/search/search-page-query";
import { locationMemberParticipationSql } from "../src/modules/management/audit-investigation/search/search-selector-query";
import { searchAuditInvestigationSessions } from "../src/modules/management/audit-investigation/search/audit-investigation-search.service";
import { searchWitnessSql } from "../src/modules/management/audit-investigation/search/search-witness-sql";

const org = "10000000-0000-4000-8000-000000000001";
const loc = "10000000-0000-4000-8000-000000000002";
const member = "10000000-0000-4000-8000-000000000003";
const event = "10000000-0000-4000-8000-000000000011";
const from = "2026-10-18T10:00:00.000Z";
const to = "2026-10-18T11:00:00.000Z";
const scope = {
  organizationId: org,
  locationId: loc,
  membershipId: member,
  role: "LOCATION_MANAGER" as const,
};

describe("W2 response coverage without PostgreSQL", () => {
  it("allows only direct or explicit Session entity Audit anchors", () => {
    expect(searchWitnessSql).toContain(
      "AND NOT (a.event_type = 'VALET_SESSION_PARKED'",
    );
    expect(locationMemberParticipationSql).toContain(
      "AND NOT (a.event_type = 'VALET_SESSION_PARKED'",
    );
    expect(searchWitnessSql).toContain("a.valet_session_id IS NOT NULL");
    expect(searchWitnessSql).toContain("a.entity_id = resolved.id");
    expect(searchWitnessSql).not.toMatch(
      /task_ref\.pagination_birth_xid <= a\.pagination_birth_xid/,
    );
    expect(locationMemberParticipationSql).toContain(
      "a.valet_session_id = audit_session.id",
    );
    expect(locationMemberParticipationSql).toContain(
      "a.entity_id = audit_session.id",
    );
    expect(locationMemberParticipationSql).not.toContain(
      "task_ref.valet_session_id = audit_session.id)\n            OR",
    );
    expect(locationMemberParticipationSql).toContain(
      "a.pagination_birth_xid IS NOT NULL",
    );
  });

  it("does not inspect cross-tenant parent rows when determining scoped coverage", () => {
    for (const alias of ["entity_task", "entity_incident", "metadata_task"]) {
      const joined = auditInvestigationIntegritySql
        .split(new RegExp(`LEFT JOIN (?:tasks|incidents) ${alias} ON`))[1]
        ?.split("LEFT JOIN")[0];
      expect(joined).toContain(`${alias}.organization_id = $1::uuid`);
      expect(joined).toContain(`${alias}.location_id = $2::uuid`);
      expect(joined).toContain(`${alias}.pagination_birth_xid`);
    }
  });

  it("reports a generic location-only anomaly, with no rejected identifiers or count", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === auditInvestigationIntegritySql)
        return { rows: [{ hasAnomaly: true }] };
      if (sql.includes('AS "incidentAvailable"')) return { rows: [] };
      return { rows: [{ active: true }] };
    });
    const tx = { query } as unknown as PostgresTransaction;
    const snapshot = {
      now: new Date(to),
      cutoff: to.replace(".000Z", ".000500Z"),
      database: "100:100:",
    };
    const result = await searchAuditInvestigationSessions(
      tx,
      scope,
      {
        from,
        to,
        limit: 25,
      },
      snapshot,
    );
    expect(result.items).toEqual([]);
    expect(result.coverage.AUDIT).toEqual({
      status: "PARTIAL",
      reason: "INTEGRITY_ANOMALY",
    });
    expect(JSON.stringify(result)).not.toContain(event);
    expect(query).toHaveBeenCalledWith(auditInvestigationIntegritySql, [
      org,
      loc,
      from,
      to,
      snapshot.cutoff,
      snapshot.database,
    ]);
  });

  it("does not infer a Session-level anomaly from a location-only signal", async () => {
    const tx = {
      query: vi.fn(async () => ({ rows: [{ hasAnomaly: false }] })),
    } as unknown as PostgresTransaction;
    expect(
      await queryAuditInvestigationLocationIntegrity(
        tx,
        scope,
        { from, to },
        {
          now: new Date(to),
          cutoff: to.replace(".000Z", ".000500Z"),
          database: "100:100:",
        },
      ),
    ).toBe(false);
  });
});

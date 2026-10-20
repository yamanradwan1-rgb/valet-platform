import { describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import {
  requireAuditInvestigationDetailSource,
  type AuditInvestigationDetailSource,
} from "../src/modules/management/audit-investigation/security/audit-investigation-source-boundary";

const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  role: "LOCATION_MANAGER" as const,
};
const sessionId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";

const sources: readonly [AuditInvestigationDetailSource, string][] = [
  ["AUDIT", "audit_events"],
  ["KEY_CUSTODY", "key_custody_events"],
  ["DISPATCH", "dispatch_events"],
  ["INCIDENT", "incidents"],
];

function transaction(rowCount: number) {
  const query = vi.fn().mockResolvedValue({
    rowCount,
    rows: Array.from({ length: rowCount }, () => ({ exists: 1 })),
  });
  return { tx: { query } as unknown as PostgresTransaction, query };
}

describe("Issue300 R2 F02 — source detail boundary, offline SQL contract", () => {
  it.each(sources)("%s contains an exact scoped source without UPDATE-only evidence locks", async (source, table) => {
    const { tx, query } = transaction(1);
    await requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source, eventId,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, readonly string[]];
    expect(sql).toContain(`INNER JOIN ${table} AS evidence`);
    expect(sql).toMatch(/FOR SHARE OF session\s*$/i);
    expect(sql).not.toMatch(/FOR (UPDATE|NO KEY UPDATE|SHARE|KEY SHARE) OF[^\n]*evidence/i);
    expect(sql).toMatch(/evidence\.organization_id\s*=\s*session\.organization_id/);
    expect(sql).toMatch(/evidence\.location_id\s*=\s*session\.location_id/);
    expect(sql).toMatch(/evidence\.valet_session_id\s*=\s*session\.id/);
    expect(sql).toMatch(/session\.organization_id\s*=\s*\$1/);
    expect(sql).toMatch(/session\.location_id\s*=\s*\$2/);
    expect(sql).toMatch(/session\.id\s*=\s*\$3/);
    expect(sql).toMatch(/evidence\.id\s*=\s*\$4/);
    expect(values).toEqual([scope.organizationId, scope.locationId, sessionId, eventId]);
    expect(sql).toMatch(/^\s*SELECT 1\b/m);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|RETURNING)\b/i);
    if (source === "INCIDENT") {
      expect(sql).toContain("location.status = 'ACTIVE'");
    } else {
      expect(sql).not.toContain("location.status = 'ACTIVE'");
    }
  });

  it.each(sources)("%s denies a missing or non-contained source record", async (source) => {
    const { tx, query } = transaction(0);
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source, eventId,
    })).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies ambiguous results without disclosing record identity", async () => {
    const { tx } = transaction(2);
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source: "AUDIT", eventId,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rejects attacker-selected table names before issuing SQL", async () => {
    const { tx, query } = transaction(1);
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source: "INCIDENT UNION ALL SELECT" as "INCIDENT", eventId,
    })).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(query).not.toHaveBeenCalled();
  });
});

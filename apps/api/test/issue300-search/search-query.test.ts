import { describe, expect, it, vi } from "vitest";
import {
  auditInvestigationSearchQuerySchema,
  auditInvestigationSearchResponseSchema,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../src/common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../../src/modules/management/audit-investigation/security/audit-investigation-authorization";
import {
  normalizedInvestigationSearch,
  searchAuditInvestigationSessions,
  InvestigationSnapshotPaginationUnavailable,
} from "../../src/modules/management/audit-investigation/search/audit-investigation-search.service";
import {
  auditInvestigationFirstPageSql,
  projectAuditInvestigationSearchItem,
  queryAuditInvestigationFirstPage,
} from "../../src/modules/management/audit-investigation/search/search-page-query";
import { searchWitnessSql } from "../../src/modules/management/audit-investigation/search/search-witness-sql";
import { managementAuditKnownEventTypes } from "../../src/modules/management/management-audit-event-catalog";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";
const slotId = "10000000-0000-4000-8000-000000000004";
const memberId = "10000000-0000-4000-8000-000000000005";
const eventId = "10000000-0000-4000-8000-000000000006";
const scope: AuditInvestigationLocationAuthorization = {
  organizationId,
  locationId,
  membershipId: memberId,
  role: "LOCATION_MANAGER",
};
const query = auditInvestigationSearchQuerySchema.parse({
  from: "2026-10-23T11:00:00.000Z",
  to: "2026-10-23T12:00:00.000Z",
  keySlotId: slotId,
  membershipId: memberId,
  sessionId,
  plate: "jo 12-34",
  make: "To%_yo",
  model: "Cam\\ry",
});
const snapshot = {
  now: new Date("2026-10-23T12:01:00.000Z"),
  cutoff: "2026-10-23T12:01:00.000900Z",
  database: "150:180:",
};
const row: Parameters<typeof projectAuditInvestigationSearchItem>[0] = {
  sessionId,
  firstMatchedAt: new Date("2026-10-23T11:01:00.000Z"),
  lastMatchedAt: new Date("2026-10-23T11:59:00.000Z"),
  lastMatchedAtCursor: "2026-10-23T11:59:00.000900Z",
  matchingRecordCount: 2,
  matchedIncidentCount: 0,
  hasVisibleIncident: true,
  incidentAvailable: true,
  currentState: "PARKED",
  make: "Toyota",
  model: "Camry",
  plate: "JO-1234",
  plateCountry: "JO",
  temporaryDescriptor: null,
  keySlotId: null,
  slotCode: null,
  reasons: [
    { source: "KEY_CUSTODY", eventId, matchedBy: "KEY_SLOT" },
    {
      source: "DISPATCH",
      eventId,
      matchedBy: "EMPLOYEE",
      participationRole: "PREVIOUS_ASSIGNEE",
    },
  ],
};

function fakeTx(rows: readonly unknown[]) {
  const querySpy = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    void sql;
    void values;
    return { rows };
  });
  return {
    querySpy,
    tx: { query: querySpy } as unknown as PostgresTransaction,
  };
}

describe("#300 first-page historical SQL (no PostgreSQL execution)", () => {
  it("strictly rejects unapproved query keys and incorrect UTC interval", () => {
    expect(
      auditInvestigationSearchQuerySchema.safeParse({
        ...query,
        descriptor: "red",
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationSearchQuerySchema.safeParse({
        ...query,
        to: query.from,
      }).success,
    ).toBe(false);
    expect(
      auditInvestigationSearchQuerySchema.safeParse({
        ...query,
        from: "2026-10-23T14:00:00+03:00",
      }).success,
    ).toBe(false);
  });

  it("never models current Session slot or current Task assignee as historical witness", () => {
    expect(searchWitnessSql).toContain("k.key_slot_id");
    expect(searchWitnessSql).toContain("d.previous_assignee_membership_id");
    expect(searchWitnessSql).toContain("d.new_assignee_membership_id");
    expect(searchWitnessSql).toContain("i.reported_by_membership_id");
    expect(searchWitnessSql).not.toMatch(/session\.key_slot_id/);
    expect(searchWitnessSql).not.toMatch(/current_assignee_membership_id/);
    expect(searchWitnessSql).toContain("bool_or(key_match)");
    expect(searchWitnessSql).toContain("bool_or(employee_role IS NOT NULL)");
    expect(searchWitnessSql).toContain("a.pagination_birth_xid");
    expect(searchWitnessSql).toContain(
      "task_meta.id::text = a.metadata_json->>'taskId'",
    );
    expect(searchWitnessSql).toContain("a.event_type = 'VALET_SESSION_PARKED'");
    expect(searchWitnessSql).toContain(
      "task_meta.valet_session_id = resolved.id",
    );
    expect(searchWitnessSql).toContain("NOT (a.metadata_json ? 'taskId')");
    expect(searchWitnessSql).not.toMatch(/metadata_json->>'taskId'\s*\)::uuid/);
    for (const source of ["k", "d", "i", "a", "s", "resolved"]) {
      expect(searchWitnessSql).toContain(`${source}.pagination_birth_xid`);
    }
  });

  it("rejects a contradictory Vehicle entity rather than creating a false Audit witness", () => {
    expect(searchWitnessSql).toContain(
      "a.entity_type NOT IN ('Vehicle', 'VEHICLE')",
    );
    expect(searchWitnessSql).toContain("a.entity_id = resolved.vehicle_id");
    expect(searchWitnessSql).toContain("a.valet_session_id = resolved.id");
  });

  it("requires positive same-session Task/Incident links, and suppresses unknown Audit actor witnesses", () => {
    expect(searchWitnessSql).toContain("a.entity_type NOT IN ('Task', 'TASK')");
    expect(searchWitnessSql).toContain(
      "task_ref.id IS NOT NULL AND task_ref.valet_session_id = resolved.id",
    );
    expect(searchWitnessSql).toContain(
      "a.entity_type NOT IN ('Incident', 'INCIDENT')",
    );
    expect(searchWitnessSql).toContain(
      "incident_ref.id IS NOT NULL AND incident_ref.valet_session_id = resolved.id",
    );
    expect(searchWitnessSql).toContain("a.event_type::text = ANY($15::text[])");
  });

  it("uses separate scoped arms with exclusive end, first-page limit+1 and bound params", async () => {
    const { tx, querySpy } = fakeTx([row]);
    const normalized = normalizedInvestigationSearch(query);
    expect(normalized.plate).toBe("JO1234");
    expect(normalized.makePrefix).toBe("to\\%\\_yo%");
    expect(normalized.modelPrefix).toBe("cam\\\\ry%");
    await queryAuditInvestigationFirstPage(
      tx,
      scope,
      query,
      normalized,
      snapshot,
    );
    const [sql, params] = querySpy.mock.calls[0]!;
    expect(sql).toBe(auditInvestigationFirstPageSql);
    expect(sql).toContain("k.occurred_at >= $3::timestamptz");
    expect(sql).toContain("d.occurred_at < $4::timestamptz");
    expect(sql).toContain("ORDER BY summary.last_at DESC, session.id DESC");
    expect(sql).toContain('AS "lastMatchedAtCursor"');
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s/i);
    expect(params).toEqual([
      organizationId,
      locationId,
      query.from,
      query.to,
      slotId,
      memberId,
      "to\\%\\_yo%",
      "cam\\\\ry%",
      snapshot.cutoff,
      snapshot.database,
      26,
      null,
      "JO1234",
      sessionId,
      managementAuditKnownEventTypes,
      null,
      null,
    ]);
  });
  it("passes a full six-digit signed Search position directly to PostgreSQL", async () => {
    const { tx, querySpy } = fakeTx([]);
    const after = { lastMatchedAt: "2026-10-23T11:59:00.000900Z", sessionId };
    await queryAuditInvestigationFirstPage(
      tx,
      scope,
      query,
      normalizedInvestigationSearch(query),
      snapshot,
      after,
    );
    expect(querySpy.mock.calls[0]?.[1]?.[15]).toBe(after.lastMatchedAt);
    expect(querySpy.mock.calls[0]?.[1]?.[8]).toBe(snapshot.cutoff);
    expect(auditInvestigationFirstPageSql).toContain(
      "(summary.last_at, session.id) <",
    );
  });

  it("keeps incidents outside the search window as current indication, not matched count", () => {
    const item = projectAuditInvestigationSearchItem(row);
    expect(item.hasVisibleIncident).toBe(true);
    expect(item.matchedIncidentCount).toBe(0);
    expect(item.matchingRecordCount).toBe(2);
    expect(item.currentKeySlot.keySlotId).toBeNull();
    expect(item.currentVehicle.temporaryDescriptor.unavailable).toBe(true);
    expect(item.matchReasons.map((reason) => reason.matchedBy)).toEqual([
      "KEY_SLOT",
      "EMPLOYEE",
    ]);
  });

  it("fails closed on an overfull page; never invents cursor or truncates matches", async () => {
    const { tx } = fakeTx(Array(26).fill(row));
    await expect(
      searchAuditInvestigationSessions(tx, scope, query, snapshot),
    ).rejects.toBeInstanceOf(InvestigationSnapshotPaginationUnavailable);
  });
  it.each(["make", "model", "plate", "plateCountry"] as const)(
    "never mints or accepts a continuation with a mutable %s selector",
    async (field) => {
      const filtered = auditInvestigationSearchQuerySchema.parse({
        from: query.from, to: query.to,
        [field]: field === "plateCountry" ? "JO" : query[field],
      });
      const binding = {
        purpose: "SEARCH_SESSIONS" as const,
        organizationId, locationId,
        viewerSessionDigest: "a".repeat(64), filterDigest: "b".repeat(64),
      };
      const overfull = fakeTx(Array(filtered.limit + 1).fill(row));
      await expect(searchAuditInvestigationSessions(
        overfull.tx,
        scope, filtered, snapshot, binding,
      )).rejects.toBeInstanceOf(InvestigationSnapshotPaginationUnavailable);
      expect(overfull.querySpy).toHaveBeenCalledTimes(1);
      const continued = fakeTx([row]);
      await expect(searchAuditInvestigationSessions(
        continued.tx, scope, filtered, snapshot, binding,
        { lastMatchedAt: row.lastMatchedAtCursor, sessionId },
      )).rejects.toBeInstanceOf(InvestigationSnapshotPaginationUnavailable);
      // Reject the mutable continuation directly; no fallback cohort-query
      // failure may impersonate this test's intended 503 reason.
      expect(continued.querySpy).toHaveBeenCalledTimes(1);
    },
  );

  it("returns contract-shaped first page only when no continuation exists", async () => {
    const { tx } = fakeTx([row]);
    const result = await searchAuditInvestigationSessions(
      tx,
      scope,
      query,
      snapshot,
    );
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(
      auditInvestigationSearchResponseSchema.safeParse(result).success,
    ).toBe(true);
  });
});

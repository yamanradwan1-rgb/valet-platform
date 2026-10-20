import { describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import type { AuditInvestigationLocationAuthorization } from "../src/modules/management/audit-investigation/security/audit-investigation-authorization";
import {
  hasAnchoredTimelineAuditAnomaly,
  indirectAuditContainmentSql,
  requireIndirectAuditSessionContainment,
} from "../src/modules/management/audit-investigation/timeline/timeline-indirect-audit";
import {
  projectTimelineDetail,
  projectTimelineRow,
} from "../src/modules/management/audit-investigation/timeline/timeline-safe-projection";
import {
  readTimelineSources,
  timelineSourceSql,
  type TimelineSourceRow,
} from "../src/modules/management/audit-investigation/timeline/timeline-source-query";
import { assertOrderedDistinct } from "../src/modules/management/audit-investigation/timeline/timeline-read-service";

const id = (n: number) =>
  `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;
const scope = {
  organizationId: id(1),
  locationId: id(2),
  membershipId: id(3),
  role: "LOCATION_MANAGER",
} as AuditInvestigationLocationAuthorization;
const sessionId = id(4);

function auditRow(
  quality: NonNullable<TimelineSourceRow["evidenceQuality"]>,
): TimelineSourceRow {
  return {
    source: "AUDIT",
    id: id(5),
    kind: "VALET_SESSION_PARKED",
    occurredAt: new Date("2026-10-18T11:01:00Z"),
    occurredAtCursor: "2026-10-18T11:01:00.000500Z",
    recordedAt: new Date("2026-10-18T11:01:02Z"),
    actorId: id(6),
    actorName: "Samir Khalil",
    previousId: null,
    previousName: null,
    nextId: null,
    nextName: null,
    reporterId: null,
    reporterName: null,
    keySlotId: null,
    taskId: null,
    incidentType: null,
    incidentSeverity: null,
    incidentStatus: null,
    evidenceQuality: quality,
  };
}

describe("U-002 Timeline confidence and safe identity", () => {
  it("keeps confidence per admitted source rather than equating it to coverage", () => {
    const recorded = projectTimelineRow(auditRow("RECORDED"), sessionId);
    const partial = projectTimelineRow(auditRow("PARTIAL"), sessionId);
    const unverifiable = projectTimelineRow(
      auditRow("UNVERIFIABLE"),
      sessionId,
    );
    expect(recorded.quality).toBe("RECORDED");
    expect(partial.quality).toBe("PARTIAL");
    expect(unverifiable.quality).toBe("UNVERIFIABLE");
    expect(recorded.actor?.membershipId).toBe(id(6));
    expect(partial.actor).toBeNull();
    expect(unverifiable.actor).toBeNull();
    expect(unverifiable.participants).toEqual([]);
    expect(unverifiable.references).toEqual([
      { kind: "SESSION", id: sessionId },
    ]);
    expect(
      projectTimelineDetail(auditRow("UNVERIFIABLE"), sessionId).actor,
    ).toBeNull();
    expect(JSON.stringify(unverifiable)).not.toContain("Samir");
  });

  it("continues to mask unknown source kinds and actor even if marked recorded", () => {
    const row = { ...auditRow("RECORDED"), kind: "PRIVATE_CUSTOM_KIND" };
    const projected = projectTimelineRow(row, sessionId);
    expect(projected.kind).toBe("UNKNOWN");
    expect(projected.quality).toBe("UNVERIFIABLE");
    expect(projected.actor).toBeNull();
    expect(JSON.stringify(projected)).not.toContain("PRIVATE_CUSTOM_KIND");
  });

  it("shows only independently anchored PARKED event facts without Task hint", () => {
    const directMissingHint = projectTimelineRow(
      auditRow("PARTIAL"),
      sessionId,
    );
    const legacyEntityMissingHint = projectTimelineRow(
      auditRow("UNVERIFIABLE"),
      sessionId,
    );
    for (const event of [directMissingHint, legacyEntityMissingHint]) {
      expect(event.kind).toBe("VALET_SESSION_PARKED");
      expect(event.actor).toBeNull();
      expect(event.participants).toEqual([]);
      expect(event.references).toEqual([{ kind: "SESSION", id: sessionId }]);
      expect(event.relatedEvidence).toEqual([]);
    }
    expect(directMissingHint.quality).toBe("PARTIAL");
    expect(legacyEntityMissingHint.quality).toBe("UNVERIFIABLE");
    const detail = projectTimelineDetail(auditRow("PARTIAL"), sessionId);
    expect(detail.actor).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("Samir Khalil");
    expect(detail.references).toEqual([{ kind: "SESSION", id: sessionId }]);
  });
});

describe("historical association and privilege boundaries", () => {
  it("orders microsecond-different events before UUID even when JS Date milliseconds tie", () => {
    const earlier = {
      ...auditRow("RECORDED"),
      id: id(9),
      occurredAtCursor: "2026-10-18T11:01:00.000500Z",
    };
    const later = {
      ...auditRow("RECORDED"),
      id: id(5),
      occurredAtCursor: "2026-10-18T11:01:00.000900Z",
    };
    expect(earlier.occurredAt.getTime()).toBe(later.occurredAt.getTime());
    expect(() => assertOrderedDistinct([earlier, later])).not.toThrow();
    expect(() => assertOrderedDistinct([later, earlier])).toThrow();
    expect(() => assertOrderedDistinct([earlier, earlier])).toThrow();
    const tiedLater = { ...earlier, id: id(10) };
    expect(() => assertOrderedDistinct([earlier, tiedLater])).not.toThrow();
    expect(() => assertOrderedDistinct([tiedLater, earlier])).toThrow();
  });
  it("separates source+parent fences from four-source keyset pagination", async () => {
    expect(timelineSourceSql).toMatch(
      /audit\.entity_type IN \('ValetSession', 'VALET_SESSION'\)/,
    );
    expect(timelineSourceSql).toContain("audit.entity_id = session.id");
    const association = timelineSourceSql
      .split("  WHERE (\n    audit.valet_session_id = session.id")[1]
      ?.split("  AND (\n    audit.entity_type NOT IN")[0];
    expect(association).toBeDefined();
    expect(association).not.toMatch(/linked_task\.id|linked_incident\.id/);
    expect(association).not.toMatch(/audit\.pagination_birth_xid IS NOT NULL/);
    expect(association).toMatch(/OR NOT \(audit\.metadata_json \? 'taskId'\)/);
    expect(timelineSourceSql).toMatch(
      /audit\.event_type = 'VALET_SESSION_PARKED'\s+AND NOT \(audit\.metadata_json \? 'taskId'\)/,
    );
    expect(timelineSourceSql).toMatch(/THEN 'UNVERIFIABLE' ELSE 'PARTIAL'/);
    expect(timelineSourceSql).toMatch(
      /jsonb_typeof\(audit\.metadata_json->'taskId'\) = 'string'\s+AND parked_task\.id IS NOT NULL/,
    );
    expect(timelineSourceSql).not.toContain(
      "linked_task.pagination_birth_xid <= audit.pagination_birth_xid",
    );
    expect(timelineSourceSql).not.toContain(
      "linked_incident.pagination_birth_xid <= audit.pagination_birth_xid",
    );
    expect(timelineSourceSql).toMatch(/audit\.metadata_json \? 'taskId'/);
    expect(timelineSourceSql).toMatch(/linked_task\.id = parked_task\.id/);
    expect(timelineSourceSql).toMatch(
      /ORDER BY occurred_at ASC, rank ASC, id ASC/,
    );
    for (const name of ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"])
      expect(timelineSourceSql).toContain(`'${name}'`);
    expect(timelineSourceSql).not.toMatch(
      /incident\.description|audit\.metadata_json AS/i,
    );

    let args: readonly unknown[] = [];
    const tx = {
      query: async (_sql: string, values: readonly unknown[]) => {
        args = values;
        return { rows: [] };
      },
    } as unknown as PostgresTransaction;
    expect(await readTimelineSources(tx, scope, sessionId, 101)).toEqual([]);
    expect(args).toEqual([
      scope.organizationId,
      scope.locationId,
      sessionId,
      101,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("keeps the Session lock but never locks append-only Audit evidence", async () => {
    expect(indirectAuditContainmentSql).toMatch(/FOR SHARE OF session\s*$/);
    expect(indirectAuditContainmentSql).not.toMatch(
      /FOR SHARE OF session, audit/,
    );
    expect(indirectAuditContainmentSql).toContain(
      "audit.valet_session_id IS NULL",
    );
    expect(indirectAuditContainmentSql).toContain(
      "OR NOT (audit.metadata_json ? 'taskId')",
    );
    expect(indirectAuditContainmentSql).toContain(
      "jsonb_typeof(audit.metadata_json->'taskId') = 'string' AND EXISTS",
    );
    expect(indirectAuditContainmentSql).toContain(
      "parked_task.task_type = 'PARKING'",
    );
    expect(indirectAuditContainmentSql).toContain(
      "audit.entity_id = session.id",
    );
    expect(indirectAuditContainmentSql).not.toContain(
      "task.pagination_birth_xid <= audit.pagination_birth_xid",
    );
    const calls: unknown[][] = [];
    const tx = {
      query: async (_sql: string, values: unknown[]) => {
        calls.push(values);
        return { rowCount: 0 };
      },
    } as unknown as PostgresTransaction;
    await expect(
      requireIndirectAuditSessionContainment(tx, scope, sessionId, id(5)),
    ).rejects.toThrow();
    expect(calls).toEqual([
      [scope.organizationId, scope.locationId, sessionId, id(5)],
    ]);
  });

  it("offers a generic anomaly only for a directly anchored, scoped Session", async () => {
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const tx = {
      query: async (sql: string, values: readonly unknown[]) => {
        queries.push({ sql, values });
        return { rows: [{ anomalous: true }] };
      },
    } as unknown as PostgresTransaction;
    const boundary = {
      database: "300:302:",
      cutoff: "2026-10-18T12:00:00.000500Z",
    };
    expect(
      await hasAnchoredTimelineAuditAnomaly(tx, scope, sessionId, boundary),
    ).toBe(true);
    expect(queries[0]?.values).toEqual([
      scope.organizationId,
      scope.locationId,
      sessionId,
      boundary.database,
      boundary.cutoff,
    ]);
    expect(queries[0]?.sql).toContain("audit.valet_session_id = session.id");
    expect(queries[0]?.sql).toContain("audit.created_at <= $5::timestamptz");
    expect(queries[0]?.sql).toContain("pg_visible_in_snapshot");
    expect(queries[0]?.sql).not.toContain("NOT EXISTS");
    expect(queries[0]?.sql).not.toContain(
      "OR NOT (audit.metadata_json ? 'taskId')",
    );
    expect(queries[0]?.sql).toContain("audit.metadata_json ? 'taskId'\n");
    expect(queries[0]?.sql).not.toMatch(/count\s*\(|SELECT\s+audit\.id/i);
  });
});

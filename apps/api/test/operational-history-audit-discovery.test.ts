import { describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  discoverParkingAuditEvidence,
  type ParkingAuditEvidence,
} from "../src/modules/dashboard/operational-history-audit-discovery";
import {
  classifyParkingHistory,
  type ParkingTaskDispatchEvidence,
} from "../src/modules/dashboard/operational-history-evidence-classifier";

const org = "11111111-1111-4111-8111-111111111111";
const loc = "22222222-2222-4222-8222-222222222222";
const session = "33333333-3333-4333-8333-333333333333";
const task = "44444444-4444-4444-8444-444444444444";
const actor = "55555555-5555-4555-8555-555555555555";
const time = new Date("2026-10-09T12:00:00.000Z");

const canonicalTask: ParkingTaskDispatchEvidence = {
  sessionId: session,
  taskId: task,
  status: "COMPLETED",
  taskVersion: 4,
  ownerId: actor,
  dispatchId: "66666666-6666-4666-8666-666666666666",
  actorId: actor,
  newAssigneeId: actor,
  previousAssigneeId: null,
  reason: null,
  occurredAt: time,
};
const canonicalAudit: ParkingAuditEvidence = {
  implicatedSessionId: session,
  valetSessionId: session,
  auditId: "77777777-7777-4777-8777-777777777777",
  organizationId: org,
  locationId: loc,
  actorId: actor,
  entityType: "VALET_SESSION",
  entityId: session,
  occurredAt: time,
  metadata: {
    taskId: task,
    fromTaskStatus: "IN_PROGRESS",
    toTaskStatus: "COMPLETED",
    fromTaskVersion: 3,
    toTaskVersion: 4,
    fromSessionState: "PARKING",
    toSessionState: "PARKED",
    fromSessionVersion: 7,
    toSessionVersion: 8,
  },
};

describe("DEC-103 three-reference canonical Audit discovery and fail-closed read", () => {
  it("uses indexed Organization-gated A/B/C branches and no JSON UUID cast", async () => {
    let executed = "";
    let parameters: readonly unknown[] = [];
    const transaction = {
      query: async (sql: string, values: readonly unknown[]) => {
        executed = sql;
        parameters = values;
        return { rows: [canonicalAudit] };
      },
    } as unknown as PostgresTransaction;
    const rows = await discoverParkingAuditEvidence(transaction, {
      organizationId: org,
      locationId: loc,
      sessionIds: [session],
    });
    expect(rows).toEqual([canonicalAudit]);
    expect(parameters).toEqual([org, loc, [session]]);
    expect(executed).toContain("audit.valet_session_id = ANY($3::uuid[])");
    expect(executed).toContain("audit.entity_id = ANY($3::uuid[])");
    expect(executed).toContain('(audit.metadata_json->>\'taskId\') COLLATE "C" = task.');
    expect(executed).toContain("audit.organization_id = $1");
    expect(executed).toContain("SELECT DISTINCT");
    expect(executed).toContain('task.valet_session_id AS "sessionId"');
    expect(executed).toContain("CROSS JOIN LATERAL");
    expect(executed).toContain('WHERE evidence.id = discovery."auditId"');
    expect(executed).not.toMatch(/metadata_json.*::uuid/u);
  });

  it("null session link discovered by entity yields UNVERIFIABLE", () => {
    const result = classifyParkingHistory(
      [],
      [{ ...canonicalAudit, valetSessionId: null }],
      { organizationId: org, locationId: loc, sessionId: session },
    );
    expect(result).toEqual({ proof: "UNVERIFIABLE", actorId: null });
  });

  it("Task-reference-only Audit with wrong entity or null link never proves Parker", () => {
    const result = classifyParkingHistory(
      [canonicalTask],
      [
        {
          ...canonicalAudit,
          valetSessionId: null,
          entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      ],
      { organizationId: org, locationId: loc, sessionId: session },
    );
    expect(result).toEqual({ proof: "UNVERIFIABLE", actorId: null });
  });

  it("cross-linked entity vs session vs Task cannot appoint an actor", () => {
    const wrong = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    for (const audit of [
      { ...canonicalAudit, entityId: wrong },
      { ...canonicalAudit, valetSessionId: wrong },
      { ...canonicalAudit, metadata: { taskId: wrong } },
    ]) {
      expect(
        classifyParkingHistory([canonicalTask], [audit], {
          organizationId: org,
          locationId: loc,
          sessionId: session,
        }),
      ).toEqual({ proof: "UNVERIFIABLE", actorId: null });
    }
  });

  it("preserves a valid canonical event exactly once after multi-arm discovery", () => {
    expect(
      classifyParkingHistory([canonicalTask], [canonicalAudit], {
        organizationId: org,
        locationId: loc,
        sessionId: session,
      }),
    ).toEqual({ proof: "PROVEN", actorId: actor });
    // A genuinely different Audit ID remains an integrity anomaly.
    expect(
      classifyParkingHistory(
        [canonicalTask],
        [
          canonicalAudit,
          {
            ...canonicalAudit,
            auditId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        ],
        { organizationId: org, locationId: loc, sessionId: session },
      ).proof,
    ).toBe("UNVERIFIABLE");
  });
});

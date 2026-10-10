import { describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { getOperationalHistoryForSessions } from "../src/modules/dashboard/operational-history-projection";
const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const taskId = "44444444-4444-4444-8444-444444444444";
const parkerId = "55555555-5555-4555-8555-555555555555";
const checkerId = "66666666-6666-4666-8666-666666666666";
const time = new Date("2026-10-09T12:34:56.123Z");
const session = { sessionId, checkerId };
const completeTask = {
  sessionId,
  taskId,
  status: "COMPLETED",
  taskVersion: 5,
  ownerId: parkerId,
  dispatchId: "77777777-7777-4777-8777-777777777777",
  actorId: parkerId,
  newAssigneeId: parkerId,
  previousAssigneeId: null,
  reason: null,
  occurredAt: time,
};
const canonicalAudit = {
  implicatedSessionId: sessionId,
  valetSessionId: sessionId as string | null,
  auditId: "88888888-8888-4888-8888-888888888888",
  organizationId,
  locationId,
  actorId: parkerId,
  entityType: "VALET_SESSION",
  entityId: sessionId,
  occurredAt: time,
  metadata: {
    taskId,
    fromTaskStatus: "IN_PROGRESS",
    toTaskStatus: "COMPLETED",
    fromTaskVersion: 4,
    toTaskVersion: 5,
    fromSessionState: "PARKING",
    toSessionState: "PARKED",
    fromSessionVersion: 7,
    toSessionVersion: 8,
  },
};
type TaskRow = Omit<
  typeof completeTask,
  "dispatchId" | "actorId" | "newAssigneeId" | "occurredAt"
> & {
  dispatchId: string | null;
  actorId: string | null;
  newAssigneeId: string | null;
  occurredAt: Date | null;
};
type AuditRow = typeof canonicalAudit;
type NameRow = {
  membershipId: string;
  firstName: string | null;
  lastName: string | null;
};
type Fixture = {
  tasks?: TaskRow[];
  audits?: AuditRow[];
  names?: NameRow[];
  sessions?: (typeof session)[];
};
function harness(fixture: Fixture = {}) {
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const transaction = {
    query: async (sql: string, params: readonly unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("FROM valet_sessions AS session"))
        return { rows: fixture.sessions ?? [session] };
      if (sql.includes("SELECT 'TASK'::text AS \"kind\"")) {
        const taskRows = (fixture.tasks ?? [completeTask]).map((row) => ({
          kind: "TASK",
          payload: { ...row, occurredAt: row.occurredAt?.toISOString() ?? null },
        }));
        const auditRows = (fixture.audits ?? [canonicalAudit]).map((row) => ({
          kind: "AUDIT",
          payload: { ...row, occurredAt: row.occurredAt.toISOString() },
        }));
        return { rows: [...taskRows, ...auditRows] };
      }
      if (sql.includes("FROM organization_memberships AS membership"))
        return {
          rows: fixture.names ?? [
            {
              membershipId: checkerId,
              firstName: "Original",
              lastName: "Checker",
            },
            {
              membershipId: parkerId,
              firstName: "Historic",
              lastName: "Parker",
            },
          ],
        };
      throw new Error("Unexpected query");
    },
  } as unknown as PostgresTransaction;
  return {
    calls,
    read: () =>
      getOperationalHistoryForSessions(transaction, {
        organizationId,
        locationId,
        sessionIds: [sessionId],
      }),
  };
}
describe("#276 historical Parking projection, no PostgreSQL", () => {
  it("proves the canonical writer triple and retains inactive subject read-time names", async () => {
    const { read, calls } = harness();
    const result = await read();
    expect([...result.keys()]).toEqual([sessionId]);
    expect(result.get(sessionId)).toEqual({
      checkedInBy: { firstName: "Original", lastName: "Checker" },
      parkedBy: { firstName: "Historic", lastName: "Parker" },
      parkingCompletionProof: "PROVEN",
    });
    expect(calls).toHaveLength(3);
    expect(calls.every(({ sql }) => /^\s*(SELECT|WITH)\s/u.test(sql))).toBe(true);
    expect(calls[1]?.sql).toContain("FROM tasks AS task");
    expect(calls[1]?.sql).toContain("LEFT JOIN dispatch_events AS event");
    expect(calls[1]?.sql).toContain("task.task_type = 'PARKING'");
    expect(calls[1]?.sql).not.toContain("task.status = 'COMPLETED'");
    expect(calls[1]?.sql).not.toContain("updated_at");
    expect(calls[1]?.sql).toContain("audit.valet_session_id = ANY($3::uuid[])");
    expect(calls[1]?.sql).toContain("audit.entity_id = ANY($3::uuid[])");
    expect(calls[1]?.sql).toContain("audit.metadata_json->>'taskId'");
    expect(calls[1]?.sql).toContain(
      'SELECT DISTINCT "auditId", "implicatedSessionId"',
    );
    expect(calls[1]?.sql).toContain("audit.organization_id = $1");
    expect(calls[1]?.sql).toContain("UNION ALL");
    expect(calls[0]?.params).toEqual([organizationId, locationId, [sessionId]]);
    expect(calls[1]?.params).toEqual([organizationId, locationId, [sessionId]]);
  });
  it("returns NO_RECORD only without completion or contradictory Audit", async () => {
    const result = await harness({ tasks: [], audits: [] }).read();
    expect(result.get(sessionId)).toMatchObject({
      parkingCompletionProof: "NO_RECORD",
      parkedBy: null,
    });
  });
  it("fails closed on a completed Task missing dispatch, even beside older proof", async () => {
    const olderTask = {
      ...completeTask,
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      occurredAt: new Date("2026-10-08T12:34:56.123Z"),
    };
    const newerMissing = {
      ...completeTask,
      taskId,
      dispatchId: null,
      actorId: null,
      newAssigneeId: null,
      occurredAt: null,
    };
    const olderAudit = {
      ...canonicalAudit,
      metadata: { ...canonicalAudit.metadata, taskId: olderTask.taskId },
      occurredAt: olderTask.occurredAt,
    };
    const result = await harness({
      tasks: [olderTask, newerMissing],
      audits: [olderAudit],
    }).read();
    expect(result.get(sessionId)).toMatchObject({
      parkingCompletionProof: "UNVERIFIABLE",
      parkedBy: null,
    });
  });
  it.each([
    [
      "nonterminal Dispatch COMPLETED",
      [{ ...completeTask, status: "CANCELLED" }],
      [],
    ],
    [
      "orphan canonical Audit",
      [],
      [
        {
          ...canonicalAudit,
          metadata: {
            ...canonicalAudit.metadata,
            taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        },
      ],
    ],
    [
      "malformed same-scope Audit",
      [],
      [{ ...canonicalAudit, metadata: { taskId: 123 } }],
    ],
  ] as const)(
    "classifies %s as UNVERIFIABLE even without completed Task",
    async (_label, tasks, audits) => {
      const result = await harness({
        tasks: [...tasks] as TaskRow[],
        audits: [...audits] as AuditRow[],
      }).read();
      expect(result.get(sessionId)).toMatchObject({
        parkedBy: null,
        parkingCompletionProof: "UNVERIFIABLE",
      });
    },
  );
  it.each([
    [
      "duplicate Dispatch",
      [
        completeTask,
        { ...completeTask, dispatchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
      [canonicalAudit],
    ],
    [
      "duplicate Audit",
      [completeTask],
      [
        canonicalAudit,
        { ...canonicalAudit, auditId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
    ],
    [
      "wrong actor",
      [{ ...completeTask, actorId: checkerId }],
      [canonicalAudit],
    ],
    [
      "wrong version",
      [completeTask],
      [
        {
          ...canonicalAudit,
          metadata: { ...canonicalAudit.metadata, toTaskVersion: 8 },
        },
      ],
    ],
    [
      "wrong timestamp",
      [completeTask],
      [{ ...canonicalAudit, occurredAt: new Date(time.getTime() + 1) }],
    ],
    [
      "wrong audit Location",
      [completeTask],
      [
        {
          ...canonicalAudit,
          locationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      ],
    ],
  ] as const)("fails closed on %s", async (_label, tasks, audits) => {
    const result = await harness({
      tasks: [...tasks] as TaskRow[],
      audits: [...audits] as AuditRow[],
    }).read();
    expect(result.get(sessionId)?.parkingCompletionProof).toBe("UNVERIFIABLE");
    expect(result.get(sessionId)?.parkedBy).toBeNull();
  });
  it("treats distinct Tasks tied at the maximal millisecond as UNVERIFIABLE", async () => {
    const anotherTaskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const tasks = [completeTask, { ...completeTask, taskId: anotherTaskId }];
    const audits = [
      canonicalAudit,
      {
        ...canonicalAudit,
        metadata: { ...canonicalAudit.metadata, taskId: anotherTaskId },
      },
    ];
    const result = await harness({ tasks, audits }).read();
    expect(result.get(sessionId)?.parkingCompletionProof).toBe("UNVERIFIABLE");
  });
  it("keeps PROVEN while withholding a missing, partial, or whitespace identity", async () => {
    const result = await harness({
      names: [
        { membershipId: checkerId, firstName: "Original", lastName: null },
        { membershipId: parkerId, firstName: " Historic", lastName: "Parker" },
      ],
    }).read();
    expect(result.get(sessionId)).toEqual({
      checkedInBy: null,
      parkedBy: null,
      parkingCompletionProof: "PROVEN",
    });
  });
  it("rejects out-of-scope missing page sessions without reading history", async () => {
    const { read, calls } = harness({ sessions: [] });
    await expect(read()).rejects.toThrow("session scope changed");
    expect(calls).toHaveLength(1);
  });
});

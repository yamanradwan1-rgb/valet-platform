import { describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { appendDispatchEvent } from "../src/modules/dispatch/dispatch-event-writer";
import { appendConfirmParkedAuditEvent } from "../src/modules/parking/confirm-parked-audit";
import { completeParkingTask } from "../src/modules/parking/confirm-parked-mutations";

// Test-only witness of the existing writers. No PostgreSQL connection or
// historical identity read, and NOT proof of live database event integrity.
const scope = {
  organization_id: "11111111-1111-4111-8111-111111111111",
  location_id: "22222222-2222-4222-8222-222222222222",
  valet_session_id: "33333333-3333-4333-8333-333333333333",
  task_id: "44444444-4444-4444-8444-444444444444",
  parker_id: "55555555-5555-4555-8555-555555555555",
} as const;
const occurredAt = new Date("2026-10-08T11:05:02.111Z");
const task = {
  id: scope.task_id,
  organization_id: scope.organization_id,
  location_id: scope.location_id,
  valet_session_id: scope.valet_session_id,
  status: "IN_PROGRESS",
  current_assignee_membership_id: scope.parker_id,
  version: 4,
} as const;

interface RecordedQuery {
  sql: string;
  parameters: readonly unknown[];
}

function recordQueries(taskVersion: number | null = 5) {
  const calls: RecordedQuery[] = [];
  const transaction = {
    query: async (sql: string, parameters: readonly unknown[] = []) => {
      calls.push({ sql, parameters });
      return {
        rows:
          sql.includes("UPDATE tasks") && taskVersion !== null
            ? [{ version: taskVersion }]
            : [],
      };
    },
  } as unknown as PostgresTransaction;
  return { calls, transaction };
}

describe("#276 canonical Confirm Parked writer diagnostic (no database)", () => {
  it("completes only the exact IN_PROGRESS Task version/owner", async () => {
    const { calls, transaction } = recordQueries();
    expect(await completeParkingTask(transaction, task, occurredAt)).toBe(5);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("status = 'COMPLETED'");
    expect(calls[0]?.sql).toContain("status = 'IN_PROGRESS'");
    expect(calls[0]?.sql).toContain("current_assignee_membership_id = $4");
    expect(calls[0]?.parameters).toEqual([
      scope.task_id,
      4,
      occurredAt,
      scope.parker_id,
    ]);
  });

  it("records scoped Dispatch COMPLETED + canonical Audit with the same actor and time", async () => {
    const { calls, transaction } = recordQueries();
    await appendDispatchEvent(
      transaction,
      {
        actorMembershipId: scope.parker_id,
        eventType: "COMPLETED",
        newAssigneeMembershipId: scope.parker_id,
        previousAssigneeMembershipId: null,
        occurredAt,
        reason: null,
        task,
      },
      () => "66666666-6666-4666-8666-666666666666",
    );
    await appendConfirmParkedAuditEvent(
      transaction,
      {
        actorMembershipId: scope.parker_id,
        operationTime: occurredAt,
        task,
        taskVersion: 5,
        session: {
          id: scope.valet_session_id,
          organization_id: scope.organization_id,
          location_id: scope.location_id,
          state: "PARKING",
          version: 7,
          key_slot_id: null,
          parked_at: null,
          parking_started_at: occurredAt,
          parking_spot_id: null,
          parking_zone_id: null,
        },
        sessionVersion: 8,
        parking: {
          parkingZoneId: "77777777-7777-4777-8777-777777777777",
          parkingSpotId: null,
          parkingSpotCode: null,
        },
      },
      () => "88888888-8888-4888-8888-888888888888",
    );
    expect(calls).toHaveLength(2);
    const dispatch = calls[0]!;
    const audit = calls[1]!;
    expect(dispatch.sql).toContain("INSERT INTO dispatch_events");
    expect(dispatch.parameters.slice(1, 5)).toEqual([
      scope.organization_id,
      scope.location_id,
      scope.task_id,
      scope.valet_session_id,
    ]);
    expect(dispatch.parameters.slice(5)).toEqual([
      "COMPLETED",
      scope.parker_id,
      null,
      scope.parker_id,
      null,
      occurredAt,
    ]);
    expect(audit.sql).toContain("'VALET_SESSION_PARKED'");
    expect(audit.parameters.slice(1, 5)).toEqual([
      scope.organization_id,
      scope.location_id,
      scope.valet_session_id,
      scope.parker_id,
    ]);
    expect(audit.parameters[6]).toBe(occurredAt);
    const metadata = JSON.parse(audit.parameters[5] as string) as Record<
      string,
      unknown
    >;
    expect(metadata).toMatchObject({
      taskId: scope.task_id,
      fromTaskStatus: "IN_PROGRESS",
      toTaskStatus: "COMPLETED",
      fromTaskVersion: 4,
      toTaskVersion: 5,
      fromSessionState: "PARKING",
      toSessionState: "PARKED",
      fromSessionVersion: 7,
      toSessionVersion: 8,
    });
    expect(metadata).not.toHaveProperty("email");
  });

  it("does not accept absent completion row as successful Task completion", async () => {
    const { calls, transaction } = recordQueries(null);
    await expect(
      completeParkingTask(transaction, task, occurredAt),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("UPDATE tasks");
  });
});

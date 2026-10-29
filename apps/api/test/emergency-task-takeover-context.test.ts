import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";

vi.mock("../src/modules/dispatch/emergency-task-takeover.authority", () => ({
  authorizeEmergencyTakeoverRead: vi.fn(),
}));
import { authorizeEmergencyTakeoverRead } from "../src/modules/dispatch/emergency-task-takeover.authority";
import { readEmergencyTakeoverContext } from "../src/modules/dispatch/emergency-task-takeover.detail-query";

const ids = {
  task: "550e8400-e29b-41d4-a716-446655440000",
  organization: "550e8400-e29b-41d4-a716-446655440001",
  location: "550e8400-e29b-41d4-a716-446655440002",
  session: "550e8400-e29b-41d4-a716-446655440003",
  actor: "550e8400-e29b-41d4-a716-446655440004",
  assigneeA: "550e8400-e29b-41d4-a716-446655440005",
  assigneeB: "550e8400-e29b-41d4-a716-446655440006",
  vehicle: "550e8400-e29b-41d4-a716-446655440007",
  event: "550e8400-e29b-41d4-a716-446655440008",
};
const staffSessionContext = {
  userId: ids.actor,
  staffAuthSessionId: ids.session,
  accessTokenHash: "hash",
  createdAt: new Date("2026-10-29T12:00:00Z"),
} satisfies StaffSessionContext;
const taskAuthority = {
  actorMembershipId: ids.actor,
  organizationId: ids.organization,
  locationId: ids.location,
  sessionId: ids.session,
  taskId: ids.task,
  taskType: "RETRIEVAL",
  status: "IN_PROGRESS",
  version: 9,
  assigneeMembershipId: ids.assigneeA,
  sessionState: "HANDOFF_PENDING",
} as const;

function fixture(candidateCount: number, acceptedRetrieval = true, sameTimeCustodyPair = false) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const release = vi.fn();
  const transaction = {
    release,
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("FROM retrieval_requests")) {
        const rows = acceptedRetrieval ? [{ accepted: true }] : [];
        return { rowCount: rows.length, rows };
      }
      if (sql.includes("FROM valet_sessions AS session")) {
        return {
          rowCount: 1,
          rows: [{
            keySlot: null,
            parkingSpot: null,
            parkingZone: null,
            vehicle: {
              id: ids.vehicle, licensePlate: "12-34567", descriptor: null,
            },
            currentAssignee: {
              membershipId: ids.assigneeA,
              identity: {
                email: "a@example.com", firstName: "A", lastName: "Employee",
              },
            },
          }],
        };
      }
      if (sql.includes("FROM organization_memberships AS membership")) {
        const rows = Array.from({ length: candidateCount }, () => ({
          membershipId: ids.assigneeB,
          identity: {
            email: "b@example.com", firstName: "B", lastName: "Employee",
          },
        }));
        return { rowCount: rows.length, rows };
      }
      if (sql.includes("FROM key_custody_events")) {
        return {
          rowCount: sameTimeCustodyPair ? 2 : 1,
          rows: sameTimeCustodyPair ? [
            {
              eventId: "550e8400-e29b-41d4-a716-446655440000",
              eventType: "RETURNED_TO_SLOT",
              actorMembershipId: ids.assigneeA,
              keySlotId: ids.vehicle,
              occurredAt: new Date("2026-10-29T12:30:00Z"),
            },
            {
              eventId: "550e8400-e29b-41d4-a716-4466554400ff",
              eventType: "SLOT_ASSIGNED",
              actorMembershipId: ids.assigneeA,
              keySlotId: ids.vehicle,
              occurredAt: new Date("2026-10-29T12:30:00Z"),
            },
          ] : [{
            eventId: ids.event,
            eventType: "CHECKED_OUT",
            actorMembershipId: ids.assigneeA,
            keySlotId: null,
            occurredAt: new Date("2026-10-29T12:30:00Z"),
          }],
        };
      }
      if (sql.includes("FROM dispatch_events")) {
        return {
          rowCount: 1,
          rows: [{
            eventId: ids.event,
            actorMembershipId: ids.actor,
            fromAssigneeMembershipId: ids.assigneeA,
            toAssigneeMembershipId: ids.assigneeB,
            occurredAt: new Date("2026-10-29T12:40:00Z"),
          }],
        };
      }
      throw new Error("Unexpected scoped query");
    },
  };
  const pool = { connect: async () => transaction } as unknown as PostgresPool;
  return { pool, calls, release };
}

describe("Emergency takeover authorized detail projection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authorizeEmergencyTakeoverRead).mockResolvedValue(taskAuthority);
  });

  it("returns only private bounded Task facts and the last recorded custody event", async () => {
    const { pool, calls, release } = fixture(51);
    const result = await readEmergencyTakeoverContext(pool, {
      taskId: ids.task, staffSessionContext, search: "B",
    });
    expect(result.task).toMatchObject({
      id: ids.task, version: 9, sessionState: "HANDOFF_PENDING",
    });
    expect(result.canInitiate).toBe(true);
    expect(result.vehicle).toEqual({
      id: ids.vehicle, licensePlate: "12-34567", descriptor: null,
    });
    expect(result.custody).toEqual({
      source: "RECORDED",
      latestKeyEventType: "CHECKED_OUT",
      latestKeyEventActorMembershipId: ids.assigneeA,
      occurredAt: "2026-10-29T12:30:00.000Z",
    });
    expect(result.eligibleAssignees).toHaveLength(50);
    expect(result.hasMoreEligibleAssignees).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/reason|rawGps|pickupCode|verificationToken/i);
    const candidateQuery = calls.find(({ sql }) => sql.includes("LIMIT 51"));
    expect(candidateQuery?.params).toEqual([
      ids.organization, ids.location, ids.assigneeA, "B",
    ]);
    expect(calls.filter(({ sql }) => sql.includes("LIMIT 10"))).toHaveLength(2);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it("hides the emergency action without an ACCEPTED RetrievalRequest", async () => {
    const { pool } = fixture(2, false);
    const result = await readEmergencyTakeoverContext(pool, {
      taskId: ids.task, staffSessionContext,
    });
    expect(result.canInitiate).toBe(false);
  });

  it.each([
    { taskType: "PARKING", sessionState: "PARKING" },
    { taskType: "RETRIEVAL", sessionState: "HANDOFF_PENDING" },
  ] as const)(
    "hides $taskType takeover when the Task has no canonical assignee",
    async ({ taskType, sessionState }) => {
      vi.mocked(authorizeEmergencyTakeoverRead).mockResolvedValue({
        ...taskAuthority, taskType, sessionState, assigneeMembershipId: null,
      });
      const { pool, calls } = fixture(1);
      const result = await readEmergencyTakeoverContext(pool, {
        taskId: ids.task, staffSessionContext,
      });
      expect(result.task.assigneeMembershipId).toBeNull();
      expect(result.canInitiate).toBe(false);
      expect(calls.some(({ sql }) => sql.includes("FROM retrieval_requests")))
        .toBe(false);
    },
  );

  it("uses accepted custody event sequence on equal timestamps despite inverse random UUID order", async () => {
    const { pool, calls } = fixture(1, true, true);
    const result = await readEmergencyTakeoverContext(pool, {
      taskId: ids.task, staffSessionContext,
    });
    expect(result.recentCustodyEvents.map(({ eventType }) => eventType))
      .toEqual(["RETURNED_TO_SLOT", "SLOT_ASSIGNED"]);
    expect(result.custody.latestKeyEventType).toBe("RETURNED_TO_SLOT");
    const custodyQuery = calls.find(({ sql }) => sql.includes("FROM key_custody_events"));
    expect(custodyQuery?.sql).toContain("pagination_birth_xid DESC NULLS LAST");
    expect(custodyQuery?.sql).toMatch(/WHEN 'RETURNED_TO_SLOT' THEN 3[\s\S]*WHEN 'SLOT_ASSIGNED' THEN 2/);
  });

  it("recognizes an in-progress Parking Task without a RetrievalRequest", async () => {
    vi.mocked(authorizeEmergencyTakeoverRead).mockResolvedValue({
      ...taskAuthority, taskType: "PARKING", sessionState: "PARKING",
    });
    const { pool, calls } = fixture(1, false);
    const result = await readEmergencyTakeoverContext(pool, {
      taskId: ids.task, staffSessionContext,
    });
    expect(result.canInitiate).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("FROM retrieval_requests")))
      .toBe(false);
  });

  it("never advertises takeover for a mismatched lifecycle pair", async () => {
    vi.mocked(authorizeEmergencyTakeoverRead).mockResolvedValue({
      ...taskAuthority, sessionState: "COMPLETED",
    });
    const { pool, calls } = fixture(1);
    const result = await readEmergencyTakeoverContext(pool, {
      taskId: ids.task, staffSessionContext,
    });
    expect(result.canInitiate).toBe(false);
    expect(calls.some(({ sql }) => sql.includes("FROM retrieval_requests")))
      .toBe(false);
  });

  it("rejects foreign Tasks before projecting membership, vehicle or history", async () => {
    vi.mocked(authorizeEmergencyTakeoverRead).mockRejectedValue(
      Object.assign(new Error("hidden"), { code: "TASK_NOT_FOUND_OR_FORBIDDEN" }),
    );
    const { pool, calls, release } = fixture(0);
    await expect(readEmergencyTakeoverContext(pool, {
      taskId: ids.task, staffSessionContext,
    })).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    expect(calls.map(({ sql }) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledOnce();
  });
});

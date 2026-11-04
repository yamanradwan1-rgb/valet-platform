import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  findGeofenceViolationAlertCaseById,
  queryGeofenceViolationAlertCases,
} from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";

const { authorizeScope } = vi.hoisted(() => ({ authorizeScope: vi.fn() }));
vi.mock(
  "../src/modules/dashboard/management-alert-sources/management-alert-source-contract",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/modules/dashboard/management-alert-sources/management-alert-source-contract")
    >()),
    requireManagementAlertSourceScope: authorizeScope,
  }),
);

const scope = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  locationId: "00000000-0000-4000-8000-000000000002",
  membershipId: "00000000-0000-4000-8000-000000000003",
};
const context = {
  userId: "00000000-0000-4000-8000-000000000004",
  staffAuthSessionId: "00000000-0000-4000-8000-000000000005",
  accessTokenHash: "test-token-hash",
  createdAt: new Date("2026-11-04T10:00:00Z"),
};
const eventId = "00000000-0000-4000-8000-000000000006";
const alertInput = { scope, context, limit: 21 };

interface QueryCall {
  sql: string;
  values: readonly unknown[];
}

function fixture(
  options: {
    role?: "ORG_ADMIN" | "LOCATION_MANAGER";
    trackingEnabled?: boolean;
    roleExists?: boolean;
    rows?: readonly Record<string, unknown>[];
  } = {},
) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, values: readonly unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes("COALESCE(location.tracking_enabled_override")) {
      return options.roleExists === false
        ? { rowCount: 0, rows: [] }
        : {
            rowCount: 1,
            rows: [
              {
                role: options.role ?? "LOCATION_MANAGER",
                trackingEnabled: options.trackingEnabled ?? true,
              },
            ],
          };
    }
    if (sql.includes("FROM geofence_events AS event")) {
      const rows = options.rows ?? [];
      return { rowCount: rows.length, rows };
    }
    throw new Error("Unexpected SQL in ALT-09 read");
  });
  return {
    transaction: { query } as unknown as PostgresTransaction,
    query,
    calls,
  };
}

const persisted = {
  eventId,
  taskId: "00000000-0000-4000-8000-000000000007",
  valetSessionId: "00000000-0000-4000-8000-000000000008",
  trackingSessionId: "00000000-0000-4000-8000-000000000009",
  mapAreaId: "00000000-0000-4000-8000-000000000010",
  capturedAt: new Date("2026-11-04T09:59:00Z"),
  recordedAt: new Date("2026-11-04T10:00:00Z"),
  enteredCount: 0,
  exitedCount: 1,
};

describe("Issue #414 ALT-09 source-only authorized boundary", () => {
  beforeEach(() => {
    authorizeScope.mockReset();
    authorizeScope.mockResolvedValue(scope);
  });

  it("gates exact current scoped LM tracking permission before inspecting events", async () => {
    const { transaction, calls } = fixture({ rows: [persisted] });
    const result = await queryGeofenceViolationAlertCases(
      transaction,
      alertInput,
    );
    expect(authorizeScope).toHaveBeenCalledOnce();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.values).toEqual([
      scope.organizationId,
      scope.locationId,
      scope.membershipId,
      context.userId,
    ]);
    expect(calls[0]!.sql).toContain("membership.role = 'LOCATION_MANAGER'");
    expect(calls[0]!.sql).toContain("access.location_id IS NOT NULL");
    expect(calls[0]!.sql).toContain("membership.status = 'ACTIVE'");
    expect(result).toMatchObject([
      { sourceId: eventId, subtype: "LEFT_ALLOWED_UNION" },
    ]);
  });

  it("uses committed event source, DB attention clock and exact seven-day boundary", async () => {
    const { transaction, calls } = fixture({
      role: "ORG_ADMIN",
      rows: [persisted],
    });
    const result = await queryGeofenceViolationAlertCases(
      transaction,
      alertInput,
    );
    const sql = calls[1]!.sql;
    expect(sql).toContain("FROM geofence_events AS event");
    expect(sql).toContain("JOIN task_tracking_sessions AS tracker");
    expect(sql).toContain("JOIN tasks AS task");
    expect(sql).toContain("JOIN valet_sessions AS session");
    expect(sql).toContain("JOIN location_map_areas AS area");
    expect(sql).toContain("peers.violation_count = 1");
    expect(sql).toContain("peers.entered_count = 1 AND peers.exited_count = 0");
    expect(sql).toContain("peers.entered_count = 0 AND peers.exited_count = 1");
    expect(sql).toContain(
      "event.recorded_at >= instant.at - INTERVAL '7 days'",
    );
    expect(sql).toContain("event.recorded_at <= instant.at");
    expect(sql).toContain("event.occurred_at >= tracker.started_at");
    expect(sql).toContain(
      "event.occurred_at <= event.recorded_at + INTERVAL '30 seconds'",
    );
    expect(sql).toContain("ORDER BY event.recorded_at DESC, event.id DESC");
    expect(sql).not.toMatch(
      /latitude|longitude|raw_gps_samples|assignee_membership_id/,
    );
    expect(calls[1]!.values).toEqual([
      scope.organizationId,
      scope.locationId,
      21,
    ]);
    expect(result[0]?.attentionAt).toBe("2026-11-04T10:00:00.000Z");
    expect(result[0]?.capturedAt).toBe("2026-11-04T09:59:00.000Z");
  });

  it("does not query protected event IDs after Staff/grant revocation", async () => {
    authorizeScope.mockRejectedValue(new Error("AUTHORIZATION_DENIED"));
    const { transaction, query } = fixture({ rows: [persisted] });
    await expect(
      queryGeofenceViolationAlertCases(transaction, alertInput),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed if LM lost tracking source right or policy is disabled", async () => {
    for (const options of [{ roleExists: false }, { trackingEnabled: false }]) {
      const { transaction, calls } = fixture(options);
      await expect(
        queryGeofenceViolationAlertCases(transaction, alertInput),
      ).rejects.toThrow();
      expect(calls).toHaveLength(1);
    }
  });

  it("locates exact committed ID independently of list pages, never a tracker ID", async () => {
    const { transaction, calls } = fixture({ rows: [persisted] });
    const result = await findGeofenceViolationAlertCaseById(transaction, {
      context,
      scope,
      sourceId: eventId,
    });
    expect(result?.sourceId).toBe(eventId);
    expect(calls[1]!.sql).toContain("AND event.id = $4::uuid");
    expect(calls[1]!.values).toEqual([
      scope.organizationId,
      scope.locationId,
      1,
      eventId,
    ]);
    await expect(
      findGeofenceViolationAlertCaseById(transaction, {
        context,
        scope,
        sourceId: "not-a-uuid",
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});

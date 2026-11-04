import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { lockAndRecheckStaffSessionContext } from "../src/modules/auth/staff-session-revalidation";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { queryRetrievalSlaAlertCases } from "../src/modules/dashboard/management-alert-sources/retrieval-sla-alert-reader";
import { queryIncidentAlertCases } from "../src/modules/dashboard/management-alert-sources/incident-alert-reader";
import { queryPresenceReviewAlertCases } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";
import type { ManagementAlertReaderInput } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";

vi.mock("../src/modules/dashboard/dashboard-read-authorization", () => ({
  authorizeDashboardReadLocation: vi.fn(),
}));
vi.mock("../src/modules/auth/staff-session-revalidation", () => ({
  lockAndRecheckStaffSessionContext: vi.fn(),
}));

const input: ManagementAlertReaderInput = {
  context: {
    accessTokenHash: "test-token-hash",
    createdAt: new Date("2026-11-04T00:00:00.000Z"),
    staffAuthSessionId: "staff-session",
    userId: "current-user",
  },
  scope: {
    organizationId: "organization-a",
    locationId: "location-a",
    membershipId: "membership-a",
  },
  limit: 21,
};

const authorize = vi.mocked(authorizeDashboardReadLocation);
const staffSession = vi.mocked(lockAndRecheckStaffSessionContext);

function fakeTransaction(
  sourceRows: Record<string, unknown>[],
  entitlement = true,
) {
  const statements: Array<{ sql: string; args?: readonly unknown[] }> = [];
  const transaction = {
    query: vi.fn(async (sql: string, args?: readonly unknown[]) => {
      statements.push(args === undefined ? { sql } : { sql, args });
      if (sql.includes("shift_presence_lock_management_entitlement")) {
        return { rows: [{ enabled: entitlement }], rowCount: 1 };
      }
      return { rows: sourceRows, rowCount: sourceRows.length };
    }),
  } as unknown as PostgresTransaction;
  return { transaction, statements };
}

beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue(input.scope);
  staffSession.mockResolvedValue({
    id: input.context.staffAuthSessionId,
    user_id: input.context.userId,
    created_at: input.context.createdAt,
  });
});

describe("Issue #414 P1 management source authorization and query contracts", () => {
  it("denies an invalid current token before LM scope and every family source query", async () => {
    const { transaction, statements } = fakeTransaction([]);
    staffSession.mockResolvedValue(undefined);
    await expect(
      queryIncidentAlertCases(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      queryRetrievalSlaAlertCases(transaction, {
        ...input,
        graceSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      queryPresenceReviewAlertCases(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(staffSession).toHaveBeenCalledTimes(3);
    expect(authorize).not.toHaveBeenCalled();
    expect(statements).toHaveLength(0);
  });

  it("denies a stale or mismatched source scope before querying protected incidents", async () => {
    const { transaction, statements } = fakeTransaction([]);
    authorize.mockResolvedValueOnce(null);
    await expect(
      queryIncidentAlertCases(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(statements).toHaveLength(0);

    authorize.mockResolvedValueOnce({
      ...input.scope,
      membershipId: "different",
    });
    await expect(
      queryIncidentAlertCases(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(statements).toHaveLength(0);
  });

  it("uses a strictly bounded, matched, covered current attempt and sanitized CRITICAL identity", async () => {
    const { transaction, statements } = fakeTransaction([
      {
        requestId: "request-uuid",
        requestedAt: new Date("2026-11-03T12:00:00.000Z"),
      },
    ]);
    expect(
      await queryRetrievalSlaAlertCases(transaction, {
        ...input,
        graceSeconds: 60,
      }),
    ).toEqual([
      {
        category: "ALT-01",
        severity: "CRITICAL",
        sourceKind: "RETRIEVAL",
        sourceId: "request-uuid",
        episodeId: "request-uuid",
        organizationId: "organization-a",
        locationId: "location-a",
        occurredAt: "2026-11-03T12:00:00.000Z",
        title: "Retrieval SLA exceeded",
      },
    ]);
    const source = statements[0]!;
    expect(source.sql).toContain(
      "request.sla_target_seconds_snapshot IS NOT NULL",
    );
    expect(source.sql).toContain(
      "request.requested_at = session.retrieval_requested_at",
    );
    expect(source.sql).toContain(
      "session.state='REQUESTED' AND request.status='OPEN'",
    );
    expect(source.sql).toContain(
      "session.state='RETRIEVING' AND request.status='ACCEPTED'",
    );
    expect(source.sql).toContain("instant.at > request.requested_at");
    expect(source.args).toEqual(["organization-a", "location-a", 60, 21]);
    expect(staffSession).toHaveBeenCalledWith(transaction, input.context);
    expect(staffSession.mock.invocationCallOrder[0]).toBeLessThan(
      authorize.mock.invocationCallOrder[0]!,
    );
    expect(authorize).toHaveBeenCalledWith(transaction, {
      authenticatedUserId: "current-user",
      staffSessionContext: input.context,
      capability: "LOCATION_DASHBOARD_READ",
      targetLocationId: "location-a",
      recordActivity: false,
    });
    await expect(
      queryRetrievalSlaAlertCases(transaction, {
        ...input,
        graceSeconds: 61,
      }),
    ).rejects.toThrow("ALT-01 grace");
    expect(statements).toHaveLength(1);
  });

  it("filters Incident severity and live status inside SQL before LIMIT, without incident text", async () => {
    const { transaction, statements } = fakeTransaction([
      {
        incidentId: "incident-uuid",
        severity: "HIGH",
        createdAt: new Date("2026-11-03T12:00:00.000Z"),
        description: "private narrative",
      },
    ]);
    const rows = await queryIncidentAlertCases(transaction, input);
    expect(rows).toMatchObject([
      {
        category: "ALT-08",
        severity: "IMPORTANT",
        sourceId: "incident-uuid",
        title: "Important incident",
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("private narrative");
    const sql = statements[0]!.sql;
    expect(sql.indexOf("incident.status IN")).toBeLessThan(
      sql.indexOf("LIMIT $3"),
    );
    expect(sql.indexOf("incident.severity IN")).toBeLessThan(
      sql.indexOf("LIMIT $3"),
    );
    expect(sql).toContain(
      "CASE WHEN incident.severity='CRITICAL' THEN 0 ELSE 1 END",
    );
    expect(sql).not.toContain("incident.description");
    expect(statements[0]!.args).toEqual(["organization-a", "location-a", 21]);
  });

  it("enforces Presence-specific entitlement before the full viewer predicate and LIMIT", async () => {
    const forbidden = fakeTransaction([], false);
    await expect(
      queryPresenceReviewAlertCases(forbidden.transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(forbidden.statements).toHaveLength(1);
    const allowed = fakeTransaction([
      {
        exceptionId: "exception-uuid",
        requestedAt: new Date("2026-11-03T12:00:00.000Z"),
        reason: "private",
      },
    ]);
    expect(
      await queryPresenceReviewAlertCases(allowed.transaction, input),
    ).toMatchObject([
      {
        category: "ALT-12",
        severity: "IMPORTANT",
        sourceKind: "PRESENCE",
        sourceId: "exception-uuid",
      },
    ]);
    expect(allowed.statements).toHaveLength(2);
    expect(allowed.statements[0]!.args).toEqual([
      "current-user",
      "staff-session",
      "test-token-hash",
      "organization-a",
    ]);
    const sql = allowed.statements[1]!.sql;
    for (const required of [
      "e.status='PENDING'",
      "clock_timestamp()<e.expires_at",
      "e.user_id<>$3",
      "u.status='ACTIVE'",
      "m.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')",
      "m.status='ACTIVE'",
      "l.status='ACTIVE'",
      "membership_location_access",
      "s.status='ACTIVE'",
      "c.consumed_at IS NULL",
      "o.status='PENDING'",
    ]) {
      expect(sql.indexOf(required)).toBeGreaterThan(-1);
      expect(sql.indexOf(required)).toBeLessThan(sql.indexOf("LIMIT $4"));
    }
    expect(
      JSON.stringify(
        await queryPresenceReviewAlertCases(allowed.transaction, input),
      ),
    ).not.toContain("private");
  });

  it("rejects source budgets exceeding the badge proof cap", async () => {
    const { transaction, statements } = fakeTransaction([]);
    await expect(
      queryIncidentAlertCases(transaction, { ...input, limit: 22 }),
    ).rejects.toThrow("source limit");
    expect(statements).toHaveLength(0);
  });
});

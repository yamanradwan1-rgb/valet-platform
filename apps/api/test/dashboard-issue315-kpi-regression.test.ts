import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool, PostgresTransaction } from "../src/common/database/postgres";
import { authorizeDashboardLocation } from "../src/modules/dashboard/dashboard-location-authorization";
import { locationKpiAnalytics } from "../src/modules/dashboard/analytics-kpi-query";
import { requireMfaAssuranceInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
} from "../src/modules/management/management-authorization";

const isolationAtQuery = new WeakMap<object, string>();

vi.mock("../src/modules/dashboard/dashboard-location-authorization", () => ({
  authorizeDashboardLocation: vi.fn(),
}));
vi.mock("../src/modules/management/management-authorization", () => ({
  authorizeCompanyAdminManagement: vi.fn(),
  eligibleCompanyAdminLocationOrganization: vi.fn(),
}));
vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  recordAdminActivityInTransaction: vi.fn(),
  requireMfaAssuranceInTransaction: vi.fn(),
}));
vi.mock("../src/modules/dashboard/analytics-period", async (original) => ({
  ...(await original<typeof import("../src/modules/dashboard/analytics-period")>()),
  resolveAnalyticsTimezone: vi.fn().mockResolvedValue("Asia/Amman"),
}));
vi.mock("../src/modules/dashboard/analytics-kpi-sla-query", () => ({
  querySlaCompliance: vi.fn(async (transaction: object) => {
    expect(isolationAtQuery.get(transaction)).toBe("repeatable read");
    return {
      denominator: 0, numerator: 0, missingTargetCount: 0,
      invalidOrMissingIntervalCount: 0, percentage: null,
    };
  }),
}));
vi.mock("../src/modules/dashboard/analytics-kpi-workforce-query", () => ({
  queryCarsPerActiveEmployee: vi.fn().mockResolvedValue({
    denominator: 0, numerator: 0, value: null,
  }),
  queryHandoffSummary: vi.fn().mockResolvedValue({
    attributedCount: 0, employeeCount: 0, missingAttributionCount: 0,
  }),
  queryHandoffEmployees: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock("../src/modules/dashboard/analytics-kpi-key-exceptions-query", () => ({
  queryKeyExceptions: vi.fn().mockResolvedValue({
    byType: [], total: 0,
  }),
}));

const lmScope = {
  organizationId: "org-315",
  membershipId: "lm-315",
  locationId: "loc-315",
};
const lm = vi.mocked(authorizeDashboardLocation);
const eligible = vi.mocked(eligibleCompanyAdminLocationOrganization);
const ca = vi.mocked(authorizeCompanyAdminManagement);
const mfa = vi.mocked(requireMfaAssuranceInTransaction);
const period = { from: "2026-07-10", to: "2026-07-10" };
const params = {
  authenticatedUserId: "user-315",
  locationId: lmScope.locationId,
  period,
  recordManagementActivity: false,
};

function simulatedPostgres() {
  const events: string[] = [];
  const transactions: Array<{ isolation: string }> = [];
  const pool = {
    connect: vi.fn(async () => {
      const state = { isolation: "read committed" };
      let inTransaction = false;
      let sharedAdvisoryHeld = false;
      transactions.push(state);
      const connection = {
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.startsWith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")) {
            expect(inTransaction).toBe(true);
            state.isolation = "repeatable read";
            isolationAtQuery.set(connection, state.isolation);
            events.push("repeatable-read");
          } else if (sql.includes("pg_advisory_lock_shared(")) {
            expect(inTransaction).toBe(false);
            expect(values).toEqual([lmScope.organizationId]);
            sharedAdvisoryHeld = true;
            events.push("shared-org-lock");
          } else if (sql.includes("pg_advisory_unlock_shared(")) {
            expect(inTransaction).toBe(false);
            expect(sharedAdvisoryHeld).toBe(true);
            expect(values).toEqual([lmScope.organizationId]);
            sharedAdvisoryHeld = false;
            events.push("shared-org-unlock");
            return { rowCount: 1, rows: [{ released: true }] };
          } else if (sql.includes("pg_advisory_xact_lock_shared")) {
            events.push("transaction-shared-lock");
            expect(values).toEqual([lmScope.organizationId]);
            return { rowCount: 1, rows: [{ readCommitted: state.isolation === "read committed" }] };
          } else if (sql === "BEGIN") {
            inTransaction = true;
            state.isolation = "read committed";
            isolationAtQuery.set(connection, state.isolation);
            events.push("begin");
          } else if (sql === "COMMIT" || sql === "ROLLBACK") {
            inTransaction = false;
            events.push(sql.toLowerCase());
          }
          return { rowCount: 0, rows: [] };
        }),
        release: vi.fn(),
      };
      isolationAtQuery.set(connection, state.isolation);
      return connection;
    }),
  };
  return { pool: pool as unknown as PostgresPool, events, transactions };
}

beforeEach(() => {
  vi.clearAllMocks();
  lm.mockResolvedValue(lmScope);
  eligible.mockResolvedValue(null);
});

describe("#315 KPI REPEATABLE READ LM regression contract", () => {
  it("pre-#315 LM authorization branch permitted complete KPIs with RR snapshot", async () => {
    // Faithful LM branch from 9abbbd2c/dashboard-read-authorization.ts.
    // This emulates that branch; the real baseline binary is not executed.
    vi.doMock("../src/modules/dashboard/dashboard-read-authorization", () => ({
      authorizeDashboardReadLocation: (
        transaction: PostgresTransaction,
        input: { authenticatedUserId: string; targetLocationId: string },
      ) => authorizeDashboardLocation(
        transaction, input.authenticatedUserId, input.targetLocationId, "DASHBOARD_ACCESS",
      ),
    }));
    vi.doMock("../src/modules/dashboard/analytics-kpi-snapshot-transaction", () => ({
      inAuthorizedKpiSnapshot: async (
        pool: PostgresPool,
        input: typeof params,
        project: (transaction: PostgresTransaction, scope: typeof lmScope) => Promise<unknown>,
      ) => {
        const conn = await pool.connect();
        try {
          await conn.query("BEGIN");
          await conn.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
          const scope = await authorizeDashboardLocation(
            conn, input.authenticatedUserId, input.locationId, "DASHBOARD_ACCESS",
          );
          if (scope === null) throw new Error("Baseline LM not authorized");
          const value = await project(conn, scope);
          await conn.query("COMMIT");
          return value;
        } finally { conn.release(); }
      },
    }));
    vi.resetModules();
    try {
      const { locationKpiAnalytics: historicalKpi } = await import(
        "../src/modules/dashboard/analytics-kpi-query"
      );
      const db = simulatedPostgres();
      expect((await historicalKpi(db.pool, params)).locationId).toBe(lmScope.locationId);
      expect(db.events).toContain("repeatable-read");
      expect(db.events).toContain("commit");
      expect(db.events).not.toContain("shared-org-lock");
    } finally {
      vi.doUnmock("../src/modules/dashboard/dashboard-read-authorization");
      vi.doUnmock("../src/modules/dashboard/analytics-kpi-snapshot-transaction");
      vi.resetModules();
    }
  });

  it("authorized LM KPIs succeed and retain a REPEATABLE READ projection", async () => {
    const db = simulatedPostgres();
    const result = await locationKpiAnalytics(db.pool, params);
    expect(result.locationId).toBe(lmScope.locationId);
    expect(db.events).toContain("repeatable-read");
    expect(db.events).toContain("shared-org-lock");
    expect(db.events).toContain("commit");
    expect(db.events.slice(0, 3)).toEqual(["shared-org-lock", "begin", "repeatable-read"]);
    expect(db.events.slice(-2)).toEqual(["commit", "shared-org-unlock"]);
    expect(db.transactions.some((state) => state.isolation === "repeatable read")).toBe(true);
    expect(lm).toHaveBeenCalledWith(
      expect.anything(), "user-315", "loc-315", "DASHBOARD_ACCESS",
    );
  });

  it("revoked LM grant denies the KPI projection after the management fence", async () => {
    lm.mockResolvedValueOnce(lmScope).mockResolvedValueOnce(null);
    const db = simulatedPostgres();
    await expect(locationKpiAnalytics(db.pool, params)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect(db.events).toContain("shared-org-lock");
    expect(db.events.slice(-2)).toEqual(["rollback", "shared-org-unlock"]);
  });

  it("Company Admin retains the distinct MFA-gated KPI authorization route", async () => {
    lm.mockResolvedValue(null);
    eligible.mockResolvedValue(lmScope.organizationId);
    ca.mockResolvedValue({
      organizationId: lmScope.organizationId,
      membershipId: "ca-315",
    } as Awaited<ReturnType<typeof authorizeCompanyAdminManagement>>);
    const db = simulatedPostgres();
    const result = await locationKpiAnalytics(db.pool, {
      ...params,
      staffSessionContext: { userId: "user-315" } as NonNullable<
        Parameters<typeof locationKpiAnalytics>[1]["staffSessionContext"]
      >,
    });
    expect(result.locationId).toBe(lmScope.locationId);
    expect(mfa).toHaveBeenCalledTimes(1);
    expect(ca).toHaveBeenCalledTimes(1);
    expect(db.events).not.toContain("shared-org-lock");
    expect(db.events).not.toContain("shared-org-unlock");
    expect(db.events).toContain("repeatable-read");
  });
});

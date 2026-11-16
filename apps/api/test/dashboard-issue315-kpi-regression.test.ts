import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isolationAtQuery,
  lmScope,
  staffContext,
  simulatedPostgres,
} from "./dashboard-issue315-kpi-fixture";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../src/common/database/postgres";
import { authorizeDashboardLocation } from "../src/modules/dashboard/dashboard-location-authorization";
import { locationKpiAnalytics } from "../src/modules/dashboard/analytics-kpi-query";
import { requireMfaAssuranceInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
} from "../src/modules/management/management-authorization";

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
  ...(await original<
    typeof import("../src/modules/dashboard/analytics-period")
  >()),
  resolveAnalyticsTimezone: vi.fn().mockResolvedValue("Asia/Amman"),
}));
vi.mock("../src/modules/dashboard/analytics-kpi-sla-query", () => ({
  querySlaCompliance: vi.fn(async (transaction: object) => {
    expect(isolationAtQuery.get(transaction)).toBe("repeatable read");
    return {
      denominator: 0,
      numerator: 0,
      missingTargetCount: 0,
      invalidOrMissingIntervalCount: 0,
      percentage: null,
    };
  }),
}));
vi.mock("../src/modules/dashboard/analytics-kpi-workforce-query", () => ({
  queryCarsPerActiveEmployee: vi.fn().mockResolvedValue({
    denominator: 0,
    numerator: 0,
    value: null,
  }),
  queryHandoffSummary: vi.fn().mockResolvedValue({
    attributedCount: 0,
    employeeCount: 0,
    missingAttributionCount: 0,
  }),
  queryHandoffEmployees: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock("../src/modules/dashboard/analytics-kpi-key-exceptions-query", () => ({
  queryKeyExceptions: vi.fn().mockResolvedValue({
    byType: [],
    total: 0,
  }),
}));

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
      ) =>
        authorizeDashboardLocation(
          transaction,
          input.authenticatedUserId,
          input.targetLocationId,
          "DASHBOARD_ACCESS",
        ),
    }));
    vi.doMock(
      "../src/modules/dashboard/analytics-kpi-snapshot-transaction",
      () => ({
        inAuthorizedKpiSnapshot: async (
          pool: PostgresPool,
          input: typeof params,
          project: (
            transaction: PostgresTransaction,
            scope: typeof lmScope,
          ) => Promise<unknown>,
        ) => {
          const conn = await pool.connect();
          try {
            await conn.query("BEGIN");
            await conn.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
            const scope = await authorizeDashboardLocation(
              conn,
              input.authenticatedUserId,
              input.locationId,
              "DASHBOARD_ACCESS",
            );
            if (scope === null) throw new Error("Baseline LM not authorized");
            const value = await project(conn, scope);
            await conn.query("COMMIT");
            return value;
          } finally {
            conn.release();
          }
        },
      }),
    );
    vi.resetModules();
    try {
      const { locationKpiAnalytics: historicalKpi } =
        await import("../src/modules/dashboard/analytics-kpi-query");
      const db = simulatedPostgres();
      expect((await historicalKpi(db.pool, params)).locationId).toBe(
        lmScope.locationId,
      );
      expect(db.events).toContain("repeatable-read");
      expect(db.events).toContain("commit");
      expect(db.events).not.toContain("shared-org-lock");
    } finally {
      vi.doUnmock("../src/modules/dashboard/dashboard-read-authorization");
      vi.doUnmock(
        "../src/modules/dashboard/analytics-kpi-snapshot-transaction",
      );
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
    expect(db.events.slice(0, 3)).toEqual([
      "shared-org-lock",
      "begin",
      "repeatable-read",
    ]);
    expect(db.events.slice(-2)).toEqual(["commit", "shared-org-unlock"]);
    expect(
      db.transactions.some((state) => state.isolation === "repeatable read"),
    ).toBe(true);
    expect(lm).toHaveBeenCalledWith(
      expect.anything(),
      "user-315",
      "loc-315",
      "DASHBOARD_ACCESS",
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
      staffSessionContext: staffContext,
    });
    expect(result.locationId).toBe(lmScope.locationId);
    expect(mfa).toHaveBeenCalledTimes(1);
    expect(ca).toHaveBeenCalledTimes(1);
    expect(db.events).toContain("mfa-factor-current-check");
    expect(db.events).not.toContain("shared-org-lock");
    expect(db.events).not.toContain("shared-org-unlock");
    expect(db.events).toContain("repeatable-read");
  });

  it("denies Company Admin KPIs when the factor was retired before the RR fence", async () => {
    lm.mockResolvedValue(null);
    eligible.mockResolvedValue(lmScope.organizationId);
    ca.mockResolvedValue({
      organizationId: lmScope.organizationId,
      membershipId: "ca-315",
    } as Awaited<ReturnType<typeof authorizeCompanyAdminManagement>>);
    const db = simulatedPostgres({ factorActive: false });
    await expect(
      locationKpiAnalytics(db.pool, {
        ...params,
        staffSessionContext: staffContext,
      }),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect(db.events).toContain("mfa-factor-current-check");
    expect(db.events).toContain("rollback");
    expect(db.events).not.toContain("commit");
  });
});

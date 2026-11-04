import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { DashboardOverviewError } from "../src/modules/dashboard/dashboard-overview-error";
import { requireManagementAlertSourceScope } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";
import {
  findFinancialAlertCaseById,
  queryFinancialAlertCases,
} from "../src/modules/dashboard/management-alert-sources/financial-alert-source-query";
import type { FinancialAlertReaderInput } from "../src/modules/dashboard/management-alert-sources/financial-alert-source-types";

vi.mock(
  "../src/modules/dashboard/management-alert-sources/management-alert-source-contract",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../src/modules/dashboard/management-alert-sources/management-alert-source-contract")
      >();
    return { ...actual, requireManagementAlertSourceScope: vi.fn() };
  },
);

const paymentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const unknownOperation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const failedOperation = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const locationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const organizationId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const valetSessionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const input: FinancialAlertReaderInput = {
  context: {
    accessTokenHash: "test-hash",
    createdAt: new Date("2026-11-04T00:00:00.000Z"),
    staffAuthSessionId: "test-staff-session",
    userId: "test-user",
  },
  scope: { locationId, organizationId, membershipId: "test-member" },
  limit: 21,
  unknownDelaySeconds: 120,
};

const base = vi.mocked(requireManagementAlertSourceScope);

function fake(
  rows: Array<Record<string, unknown>> = [],
  owningPermission = true,
) {
  const statements: Array<{ sql: string; args?: unknown[] }> = [];
  const transaction = {
    query: vi.fn(async (sql: string, args?: unknown[]) => {
      statements.push(args === undefined ? { sql } : { sql, args });
      if (sql.includes("FROM organization_memberships AS membership")) {
        return {
          rows: owningPermission ? [{ "?column?": 1 }] : [],
          rowCount: owningPermission ? 1 : 0,
        };
      }
      return { rows, rowCount: rows.length };
    }),
  } as unknown as PostgresTransaction;
  return { transaction, statements };
}

beforeEach(() => {
  vi.resetAllMocks();
  base.mockResolvedValue(input.scope);
});

describe("DEC-111 ALT-10/11 financial-only source reader", () => {
  it("refuses a stale principal before any source or owning-finance query", async () => {
    base.mockRejectedValueOnce(
      new DashboardOverviewError("AUTHORIZATION_DENIED"),
    );
    const { transaction, statements } = fake();
    await expect(
      queryFinancialAlertCases(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(statements).toHaveLength(0);
  });

  it("refuses a principal lacking the owning financial source permission before reading payments", async () => {
    const { transaction, statements } = fake([], false);
    await expect(
      queryFinancialAlertCases(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toContain("membership.role = 'ORG_ADMIN'");
    expect(statements[0]?.sql).toContain(
      "membership.role = 'LOCATION_MANAGER'",
    );
    expect(statements[0]?.sql).toContain("membership_location_access");
    expect(statements[0]?.args).toEqual([
      organizationId,
      locationId,
      input.scope.membershipId,
      input.context.userId,
    ]);
  });

  it("passes only its authorized exact scope and bounded user setting into a SINGLE source snapshot", async () => {
    const rows = [
      {
        category: "ALT-11",
        paymentId,
        operationId: unknownOperation,
        valetSessionId,
        sourceAt: new Date("2026-11-04T00:00:00.000Z"),
      },
      {
        category: "ALT-10",
        paymentId: "11111111-1111-4111-8111-111111111111",
        operationId: failedOperation,
        valetSessionId,
        sourceAt: new Date("2026-11-03T23:00:00.000Z"),
      },
    ];
    const { transaction, statements } = fake(rows);
    const result = await queryFinancialAlertCases(transaction, input);
    expect(result.map((item) => [item.category, item.episodeId])).toEqual([
      ["ALT-11", unknownOperation],
      ["ALT-10", failedOperation],
    ]);
    expect(result[0]).toMatchObject({
      sourceKind: "PAYMENT",
      sourceId: paymentId,
      title: "Payment outcome unconfirmed",
      severity: "IMPORTANT",
      organizationId,
      locationId,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /provider|payer|amount|reference|token/i,
    );
    expect(statements).toHaveLength(2);
    const source = statements[1]!;
    expect(source.args).toEqual([
      organizationId,
      locationId,
      120,
      21,
      null,
      null,
    ]);
    expect(source.sql).toContain("UNION ALL SELECT * FROM failed");
    expect(source.sql).toContain(
      "state IN ('OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED')",
    );
    expect(source.sql).toContain("operation.dispatch_guarded_at");
    expect(source.sql).toContain("now_at.at > operation.dispatch_guarded_at");
    expect(source.sql).toContain("NOT EXISTS (");
    expect(source.sql).toContain(
      "pending.state IN ('PREPARED', 'OUTCOME_UNKNOWN', 'REFERENCE_ATTACHED')",
    );
    expect(source.sql).toContain(
      "evidence.event_type = 'PROVIDER_EVENT_COLLECTION_FAILED'",
    );
    expect(source.sql).toContain(
      "operation.provider_reference = payment.provider_reference",
    );
    expect(source.sql).not.toContain("payment.updated_at");
  });

  it.each([60, 120, 600])(
    "accepts the locked ALT-11 delay %i seconds",
    async (delay) => {
      const { transaction, statements } = fake();
      await queryFinancialAlertCases(transaction, {
        ...input,
        unknownDelaySeconds: delay,
      });
      expect(statements[1]?.args?.[2]).toBe(delay);
    },
  );

  it.each([59, 601, -1, 120.5, NaN, Infinity])(
    "rejects an unapproved delay %s before any authorization or source lookup",
    async (unknownDelaySeconds) => {
      const { transaction, statements } = fake();
      await expect(
        queryFinancialAlertCases(transaction, {
          ...input,
          unknownDelaySeconds,
        }),
      ).rejects.toThrow(/outside accepted bounds/);
      expect(base).not.toHaveBeenCalled();
      expect(statements).toHaveLength(0);
    },
  );

  it("queries the exact Payment and category, rejecting a stale operation generation", async () => {
    const { transaction, statements } = fake([
      {
        category: "ALT-10",
        paymentId,
        operationId: failedOperation,
        valetSessionId,
        sourceAt: new Date("2026-11-04T00:00:00.000Z"),
      },
    ]);
    const query = {
      context: input.context,
      scope: input.scope,
      unknownDelaySeconds: input.unknownDelaySeconds,
      category: "ALT-10" as const,
      sourceId: paymentId,
    };
    const result = await findFinancialAlertCaseById(transaction, {
      ...query,
      episodeId: failedOperation,
    });
    expect(result).toMatchObject({
      category: "ALT-10",
      episodeId: failedOperation,
      valetSessionId,
    });
    expect(statements[1]?.args).toEqual([
      organizationId,
      locationId,
      120,
      1,
      paymentId,
      "ALT-10",
    ]);
    expect(
      await findFinancialAlertCaseById(transaction, {
        ...query,
        episodeId: unknownOperation,
      }),
    ).toBeNull();
  });

  it("rejects malformed exact Payment/operation IDs before querying financial rows", async () => {
    const { transaction, statements } = fake();
    await expect(
      findFinancialAlertCaseById(transaction, {
        context: input.context,
        scope: input.scope,
        unknownDelaySeconds: 120,
        category: "ALT-11",
        sourceId: "bad",
        episodeId: unknownOperation,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(statements).toHaveLength(0);
  });
});

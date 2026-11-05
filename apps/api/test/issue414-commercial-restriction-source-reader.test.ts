import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  readCompanyAdminCommercialRestrictionCase,
} from "../src/modules/management/management-commercial-restriction-alert-reader";

const caAuthorize = vi.hoisted(() => vi.fn());
vi.mock("../src/modules/management/management-authorization", () => ({
  authorizeCompanyAdminManagement: caAuthorize,
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const context = {
  accessTokenHash: "redacted",
  createdAt: new Date("2026-11-04T08:00:00.000Z"),
  staffAuthSessionId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
};
const input = { context, organizationId };

function subscriptionDatabase(row: boolean | null) {
  const query = vi.fn(async (sql: string, parameters: unknown[]) => {
    expect(parameters).toEqual([organizationId]);
    expect(sql).toMatch(/dashboard_access_enabled/);
    expect(sql).toMatch(/FROM organization_subscriptions/);
    expect(sql).toMatch(/organization_id\s*=\s*\$1/);
    expect(sql).not.toMatch(/plan_code|status|\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
    return {
      rows: row === null ? [] : [{ dashboardAccessEnabled: row }],
    };
  });
  return { transaction: { query } as unknown as PostgresTransaction, query };
}

beforeEach(() => {
  caAuthorize.mockReset().mockResolvedValue({ organizationId });
});

describe("ALT-17 CA subscription utility restriction source", () => {
  it.each([
    ["SUSPENDED label with access restored", true, false],
    ["ACTIVE label without Dashboard entitlement", false, true],
    ["no persisted subscription or effective entitlement", null, true],
  ] as const)("%s", async (_name, dashboardEnabled, restricted) => {
    const { transaction } = subscriptionDatabase(dashboardEnabled);
    const found = await readCompanyAdminCommercialRestrictionCase(
      transaction,
      input,
    );
    expect(caAuthorize).toHaveBeenCalledWith(transaction, context, {
      capability: "COMPANY_DASHBOARD_READ",
      commercialRequirement: null,
      organizationId,
    });
    if (!restricted) {
      expect(found).toBeNull();
    } else {
      expect(found).toEqual({
        category: "ALT-17",
        severity: "IMPORTANT",
        sourceKind: "SUBSCRIPTION",
        organizationId,
        title: "Management Dashboard access restricted",
      });
      expect(found).not.toHaveProperty("occurredAt");
      expect(found).not.toHaveProperty("episodeId");
    }
  });

  it("denies LM, staff, revoked membership, expired MFA or foreign tenant before source query", async () => {
    const { transaction, query } = subscriptionDatabase(false);
    caAuthorize.mockRejectedValueOnce(new Error("AUTHORIZATION_DENIED"));
    await expect(readCompanyAdminCommercialRestrictionCase(transaction, input))
      .rejects.toThrow("AUTHORIZATION_DENIED");
    expect(query).not.toHaveBeenCalled();
  });

  it("rechecks CA access on repeat restricted utility reads after revocation", async () => {
    const { transaction, query } = subscriptionDatabase(false);
    expect(await readCompanyAdminCommercialRestrictionCase(transaction, input))
      .toMatchObject({ category: "ALT-17" });
    caAuthorize.mockRejectedValueOnce(new Error("AUTHORIZATION_DENIED"));
    await expect(readCompanyAdminCommercialRestrictionCase(transaction, input))
      .rejects.toThrow("AUTHORIZATION_DENIED");
    expect(caAuthorize).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("never reads a second organization's commercial row", async () => {
    const { transaction } = subscriptionDatabase(false);
    await readCompanyAdminCommercialRestrictionCase(transaction, input);
    expect(caAuthorize).toHaveBeenCalledTimes(1);
  });
});

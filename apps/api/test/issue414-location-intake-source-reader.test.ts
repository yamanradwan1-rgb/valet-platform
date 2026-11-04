import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { ManagementAlertReaderInput } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";
import {
  findLocationIntakeStoppedAlertCaseById,
  queryLocationIntakeStoppedAlertCases,
} from "../src/modules/dashboard/management-alert-sources/location-intake-stopped-alert-reader";

const scopeGuard = vi.hoisted(() => vi.fn());
vi.mock(
  "../src/modules/dashboard/management-alert-sources/management-alert-source-contract",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    requireManagementAlertSourceScope: scopeGuard,
  }),
);

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const otherLocationId = "33333333-3333-4333-8333-333333333333";
const input = {
  context: {
    accessTokenHash: "redacted",
    createdAt: new Date("2026-11-04T08:00:00.000Z"),
    staffAuthSessionId: "44444444-4444-4444-8444-444444444444",
    userId: "55555555-5555-4555-8555-555555555555",
  },
  limit: 21,
  scope: {
    organizationId,
    locationId,
    membershipId: "66666666-6666-4666-8666-666666666666",
  },
} satisfies ManagementAlertReaderInput;

function locationDatabase(status: "ACTIVE" | "INACTIVE", acceptingIntake: boolean) {
  const query = vi.fn(async (sql: string, parameters: unknown[]) => {
    expect(parameters).toEqual([organizationId, locationId]);
    expect(sql).toMatch(/location\.organization_id\s*=\s*\$1/);
    expect(sql).toMatch(/location\.id\s*=\s*\$2/);
    expect(sql).toMatch(/location\.status\s*=\s*'ACTIVE'/);
    expect(sql).toMatch(/location\.accepting_intake\s*=\s*FALSE/);
    expect(sql).toMatch(/LIMIT 1/);
    expect(sql).not.toMatch(/updated_at|audit_events|\bUPDATE\b|\bINSERT\b/i);
    return {
      rows: status === "ACTIVE" && !acceptingIntake ? [{ locationId }] : [],
    };
  });
  return { transaction: { query } as unknown as PostgresTransaction, query };
}

beforeEach(() => {
  scopeGuard.mockReset().mockResolvedValue(input.scope);
});

describe("ALT-16 exact authorized current Location source", () => {
  it.each([
    ["new inactive default", "INACTIVE", false, false],
    ["active accepting intake", "ACTIVE", true, false],
    ["current active intake stop", "ACTIVE", false, true],
    ["deactivated after stop", "INACTIVE", false, false],
    ["resumed after stop", "ACTIVE", true, false],
    ["stopped again", "ACTIVE", false, true],
  ] as const)("%s", async (_name, status, acceptingIntake, eligible) => {
    const { transaction } = locationDatabase(status, acceptingIntake);
    const cases = await queryLocationIntakeStoppedAlertCases(transaction, input);
    expect(cases).toHaveLength(eligible ? 1 : 0);
    if (eligible) {
      expect(cases[0]).toEqual({
        category: "ALT-16",
        severity: "IMPORTANT",
        sourceKind: "LOCATION",
        sourceId: locationId,
        organizationId,
        locationId,
        title: "Location intake stopped",
      });
      expect(cases[0]).not.toHaveProperty("occurredAt");
      expect(cases[0]).not.toHaveProperty("episodeId");
    }
    expect(scopeGuard).toHaveBeenCalledWith(transaction, input);
  });

  it("rejects revoked, ungranted or entitlement-denied scopes before any row query", async () => {
    const { transaction, query } = locationDatabase("ACTIVE", false);
    scopeGuard.mockRejectedValueOnce(new Error("AUTHORIZATION_DENIED"));
    await expect(queryLocationIntakeStoppedAlertCases(transaction, input))
      .rejects.toThrow("AUTHORIZATION_DENIED");
    expect(query).not.toHaveBeenCalled();
  });

  it("rechecks current source grant on each read after revocation", async () => {
    const { transaction, query } = locationDatabase("ACTIVE", false);
    expect(await queryLocationIntakeStoppedAlertCases(transaction, input))
      .toHaveLength(1);
    scopeGuard.mockRejectedValueOnce(new Error("AUTHORIZATION_DENIED"));
    await expect(queryLocationIntakeStoppedAlertCases(transaction, input))
      .rejects.toThrow("AUTHORIZATION_DENIED");
    expect(scopeGuard).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("exact detail cannot select another Location even after source authorization", async () => {
    const { transaction } = locationDatabase("ACTIVE", false);
    const result = await findLocationIntakeStoppedAlertCaseById(transaction, {
      ...input,
      sourceId: otherLocationId,
    });
    expect(result).toBeNull();
  });

  it("invalid source IDs fail without querying the current Location", async () => {
    const { transaction, query } = locationDatabase("ACTIVE", false);
    await expect(
      findLocationIntakeStoppedAlertCaseById(transaction, {
        ...input,
        sourceId: "untrusted-location-id",
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(query).not.toHaveBeenCalled();
  });
});

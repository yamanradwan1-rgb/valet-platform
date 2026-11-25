import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { requireManagementAlertSourceScope } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";

vi.mock("../src/modules/dashboard/dashboard-read-authorization", () => ({
  authorizeDashboardReadLocation: vi.fn(),
}));

const input = {
  context: {
    userId: "user",
    staffAuthSessionId: "session",
    rawAccessToken: "vsa1." + "A".repeat(43),
    createdAt: new Date("2026-11-04T00:00:00Z"),
  },
  scope: {
    organizationId: "organization",
    locationId: "location",
    membershipId: "member",
  },
  limit: 21,
};
const authorize = vi.mocked(authorizeDashboardReadLocation);

function database(valid = true) {
  const query = vi.fn(async () => ({
    rows: valid ? [{ id: input.context.staffAuthSessionId }] : [],
    rowCount: valid ? 1 : 0,
  }));
  return { query, transaction: { query } as unknown as PostgresTransaction };
}

beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue(input.scope);
});

describe("Issue #414 direct alert source session lock order", () => {
  it("acquires the canonical exclusive session lock before a possible CA MFA recheck", async () => {
    const { transaction, query } = database();
    await expect(
      requireManagementAlertSourceScope(transaction, input),
    ).resolves.toEqual(input.scope);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("public.staff_auth_lock_current_session("),
      [
        input.context.staffAuthSessionId,
        input.context.userId,
        input.context.rawAccessToken,
        input.context.createdAt,
        "EXCLUSIVE",
      ],
    );
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      authorize.mock.invocationCallOrder[0]!,
    );
    expect(authorize).toHaveBeenCalledExactlyOnceWith(transaction, {
      authenticatedUserId: input.context.userId,
      staffSessionContext: input.context,
      capability: "LOCATION_DASHBOARD_READ",
      targetLocationId: input.scope.locationId,
      recordActivity: false,
    });
  });

  it("denies an invalid session before the dashboard scope or any source probe", async () => {
    const { transaction } = database(false);
    await expect(
      requireManagementAlertSourceScope(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each(["organizationId", "locationId", "membershipId"] as const)(
    "rejects a mismatched %s after locked authorization",
    async (field) => {
      authorize.mockResolvedValue({ ...input.scope, [field]: "other" });
      await expect(
        requireManagementAlertSourceScope(database().transaction, input),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );
});

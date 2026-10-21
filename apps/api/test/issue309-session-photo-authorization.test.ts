import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import {
  authorizeManagementSessionPhotoView,
  authorizeSessionPhotoViewWithTestPolicy,
  type DashboardSessionPhotoViewInput,
  type SessionPhotoViewTestPolicy,
} from "../src/modules/dashboard/session-photo-authorization";
import { authorizeLiveHistoryLocation } from "../src/modules/dashboard/live-history-read-authorization";

vi.mock("../src/modules/dashboard/live-history-read-authorization", () => ({
  authorizeLiveHistoryLocation: vi.fn(),
}));

const scope = {
  organizationId: "org-A",
  locationId: "location-A",
  membershipId: "membership-A",
};
const input: DashboardSessionPhotoViewInput = {
  authenticatedUserId: "user-A",
  targetLocationId: scope.locationId,
  targetSessionId: "visit-A",
  staffSessionContext: {
    userId: "user-A",
    staffAuthSessionId: "staff-session-A",
    accessTokenHash: "token-hash-A",
    createdAt: new Date("2026-10-21T00:00:00Z"),
  },
};

const proposed: SessionPhotoViewTestPolicy = {
  proposedRoles: ["ORG_ADMIN", "LOCATION_MANAGER"],
};

function fakeTransaction(options: {
  readonly isolation?: boolean;
  readonly role?: string | null;
  readonly sessionId?: string | null;
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("transaction_isolation")) {
      return { rowCount: 1, rows: [{ readCommitted: options.isolation ?? true }] };
    }
    if (sql.includes("FROM organization_memberships AS membership")) {
      const role = options.role === undefined ? "ORG_ADMIN" : options.role;
      return {
        rowCount: role === null ? 0 : 1,
        rows: role === null ? [] : [{ role }],
      };
    }
    if (sql.includes("FROM valet_sessions AS session")) {
      const sessionId = options.sessionId === undefined ? "visit-A" : options.sessionId;
      return {
        rowCount: sessionId === null ? 0 : 1,
        rows: sessionId === null ? [] : [{ sessionId }],
      };
    }
    throw new Error("Unexpected authorization query");
  });
  return { query, transaction: { query } as unknown as PostgresTransaction };
}

describe("#309 Management photo-view authorization owner gate", () => {
  beforeEach(() => {
    vi.mocked(authorizeLiveHistoryLocation).mockReset();
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(scope);
  });

  it("production entry always denies without even reading Dashboard authority", async () => {
    const { query, transaction } = fakeTransaction();
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(authorizeLiveHistoryLocation).not.toHaveBeenCalled();
  });

  it("test seam also denies without querying under an empty proposal", async () => {
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, { proposedRoles: [] },
    )).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { authenticatedUserId: "", reason: "missing actor" },
    { targetLocationId: "", reason: "missing Location" },
    { targetSessionId: "", reason: "missing exact visit" },
    {
      staffSessionContext: { ...input.staffSessionContext, userId: "wrong" },
      reason: "unbound Staff session",
    },
  ])("refuses $reason before any DB reads", async ({ reason: _reason, ...wrong }) => {
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, { ...input, ...wrong }, proposed,
    )).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects REPEATABLE READ/SERIALIZABLE-like stale snapshots", async () => {
    const { query, transaction } = fakeTransaction({ isolation: false });
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, proposed,
    )).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(authorizeLiveHistoryLocation).not.toHaveBeenCalled();
  });

  it("denies revoked Staff credentials or current Location grant", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(null);
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, proposed,
    )).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies a mismatched authenticated Location", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue({
      ...scope, locationId: "location-other",
    });
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, proposed,
    )).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE", null])(
    "does not inherit upload/audit authority for role %s",
    async (role) => {
      const { query, transaction } = fakeTransaction({ role });
      expect(await authorizeSessionPhotoViewWithTestPolicy(
        transaction, input, proposed,
      )).toBeNull();
      expect(query).toHaveBeenCalledTimes(2);
    },
  );

  it("denies even a current Manager when not in injected proposed role set", async () => {
    const { transaction } = fakeTransaction({ role: "LOCATION_MANAGER" });
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, { proposedRoles: ["ORG_ADMIN"] },
    )).toBeNull();
  });

  it.each([null, "other-visit"])(
    "denies missing/cross-visit photo ownership boundary: %s",
    async (sessionId) => {
      const { query, transaction } = fakeTransaction({ sessionId });
      expect(await authorizeSessionPhotoViewWithTestPolicy(
        transaction, input, proposed,
      )).toBeNull();
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"])(
    "allows only hypothetical approved %s after fenced exact visit read",
    async (role) => {
      const { query, transaction } = fakeTransaction({ role });
      expect(await authorizeSessionPhotoViewWithTestPolicy(
        transaction, input, proposed,
      )).toEqual(scope);
      expect(authorizeLiveHistoryLocation).toHaveBeenCalledWith(transaction, {
        authenticatedUserId: input.authenticatedUserId,
        staffSessionContext: input.staffSessionContext,
        targetLocationId: input.targetLocationId,
      });
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[2]?.[0]).toContain("FOR SHARE OF session");
    },
  );
});

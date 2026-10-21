import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import {
  ACCEPTED_SESSION_PHOTO_VIEW_TEST_POLICY,
  authorizeManagementSessionPhotoView,
  authorizeSessionPhotoViewWithTestPolicy,
  type DashboardSessionPhotoViewInput,
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

const approved = ACCEPTED_SESSION_PHOTO_VIEW_TEST_POLICY;

function fakeTransaction(options: {
  readonly isolation?: boolean;
  readonly role?: string | null;
  readonly sessionId?: string | null;
  readonly duplicateMembership?: boolean;
  readonly duplicateSession?: boolean;
} = {}) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes("transaction_isolation")) {
      return { rowCount: 1, rows: [{ readCommitted: options.isolation ?? true }] };
    }
    if (sql.includes("FROM organization_memberships AS membership")) {
      if (params?.length !== 3) throw new Error("Unbound membership scope");
      const role = options.role === undefined ? "ORG_ADMIN" : options.role;
      return {
        rowCount: role === null ? 0 : options.duplicateMembership ? 2 : 1,
        rows: role === null ? [] : options.duplicateMembership ? [{ role }, { role }] : [{ role }],
      };
    }
    if (sql.includes("FROM valet_sessions AS session")) {
      if (params?.length !== 3) throw new Error("Unbound exact session scope");
      const sessionId = options.sessionId === undefined ? "visit-A" : options.sessionId;
      return {
        rowCount: sessionId === null ? 0 : options.duplicateSession ? 2 : 1,
        rows: sessionId === null ? [] : options.duplicateSession ? [{ sessionId }, { sessionId }] : [{ sessionId }],
      };
    }
    throw new Error("Unexpected authorization query");
  });
  return { query, transaction: { query } as unknown as PostgresTransaction };
}

describe("#309 Management photo-view authorization", () => {
  beforeEach(() => {
    vi.mocked(authorizeLiveHistoryLocation).mockReset();
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(scope);
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"])(
    "runtime entry authorizes current %s after fenced exact-session checks",
    async (role) => {
      const { query, transaction } = fakeTransaction({ role });
      expect(await authorizeManagementSessionPhotoView(transaction, input)).toEqual(scope);
      expect(query).toHaveBeenCalledTimes(3);
      expect(authorizeLiveHistoryLocation).toHaveBeenCalledWith(transaction, {
        authenticatedUserId: input.authenticatedUserId,
        staffSessionContext: input.staffSessionContext,
        targetLocationId: input.targetLocationId,
      });
    },
  );

  it("keeps runtime roles immutable and restricts the injectable policy", async () => {
    expect(approved.proposedRoles).toEqual(["ORG_ADMIN", "LOCATION_MANAGER"]);
    expect(Object.isFrozen(approved)).toBe(true);
    expect(Object.isFrozen(approved.proposedRoles)).toBe(true);
    const { query, transaction } = fakeTransaction({ role: "VALET_SUPERVISOR" });
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("test seam also denies without querying under an empty proposal", async () => {
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, { proposedRoles: [] },
    )).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { changes: { authenticatedUserId: "" }, reason: "missing actor" },
    { changes: { targetLocationId: "" }, reason: "missing Location" },
    { changes: { targetSessionId: "" }, reason: "missing exact visit" },
    {
      changes: {
        staffSessionContext: { ...input.staffSessionContext, userId: "wrong" },
      },
      reason: "unbound Staff session",
    },
  ])("refuses $reason before any DB reads", async ({ changes }) => {
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, { ...input, ...changes }, approved,
    )).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects REPEATABLE READ/SERIALIZABLE-like stale snapshots", async () => {
    const { query, transaction } = fakeTransaction({ isolation: false });
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, approved,
    )).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(authorizeLiveHistoryLocation).not.toHaveBeenCalled();
  });

  it("denies revoked Staff credentials or current Location grant", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(null);
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, approved,
    )).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("propagates the current Company Admin MFA failure before photo access", async () => {
    const mfaDenied = new MfaStepUpRequiredError();
    vi.mocked(authorizeLiveHistoryLocation).mockRejectedValueOnce(mfaDenied);
    const { query, transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    await expect(authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, approved,
    )).rejects.toBe(mfaDenied);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies a mismatched authenticated Location", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue({
      ...scope, locationId: "location-other",
    });
    const { query, transaction } = fakeTransaction();
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, approved,
    )).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE", "GUEST", null])(
    "does not inherit upload/audit authority for role %s",
    async (role) => {
      const { query, transaction } = fakeTransaction({ role });
      expect(await authorizeSessionPhotoViewWithTestPolicy(
        transaction, input, approved,
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
        transaction, input, approved,
      )).toBeNull();
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"])(
    "allows owner-approved %s only through test injection after fenced exact visit read",
    async (role) => {
      const { query, transaction } = fakeTransaction({ role });
      expect(await authorizeSessionPhotoViewWithTestPolicy(
        transaction, input, approved,
      )).toEqual(scope);
      expect(authorizeLiveHistoryLocation).toHaveBeenCalledWith(transaction, {
        authenticatedUserId: input.authenticatedUserId,
        staffSessionContext: input.staffSessionContext,
        targetLocationId: input.targetLocationId,
      });
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[2]?.[0]).toContain("FOR SHARE OF session");
      expect(query.mock.calls[1]?.[1]).toEqual([
        scope.membershipId, input.authenticatedUserId, scope.organizationId,
      ]);
      expect(query.mock.calls[2]?.[1]).toEqual([
        input.targetSessionId, scope.organizationId, scope.locationId,
      ]);
    },
  );

  it("requires active locked membership and explicit approved role, not a UI role hint", async () => {
    const { query, transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    await authorizeSessionPhotoViewWithTestPolicy(transaction, input, approved);
    const memberSql = query.mock.calls[1]?.[0] ?? "";
    expect(memberSql).toContain("membership.status = 'ACTIVE'");
    expect(memberSql).toContain("membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')");
    expect(memberSql).toContain("FOR SHARE OF membership");
  });

  it.each([
    { duplicateMembership: true },
    { duplicateSession: true },
  ])("fails closed on ambiguous identity/session rows: %o", async (options) => {
    const { transaction } = fakeTransaction(options);
    expect(await authorizeSessionPhotoViewWithTestPolicy(
      transaction, input, approved,
    )).toBeNull();
  });
});

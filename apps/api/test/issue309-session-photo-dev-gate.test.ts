import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import { authorizeLiveHistoryLocation } from "../src/modules/dashboard/live-history-read-authorization";
import {
  authorizeManagementSessionPhotoView,
  type DashboardSessionPhotoViewInput,
} from "../src/modules/dashboard/session-photo-authorization";

vi.mock("../src/modules/dashboard/live-history-read-authorization", () => ({
  authorizeLiveHistoryLocation: vi.fn(),
}));

const target = {
  organizationId: "org-A", membershipId: "membership-A", locationId: "location-A",
};
const input: DashboardSessionPhotoViewInput = {
  authenticatedUserId: "user-A",
  targetLocationId: target.locationId,
  targetSessionId: "visit-A",
  staffSessionContext: {
    userId: "user-A", staffAuthSessionId: "staff-session-A",
    accessTokenHash: "token-hash-A",
    createdAt: new Date("2026-10-21T00:00:00Z"),
  },
};

function fakeTransaction(options: {
  readonly role?: string | null;
  readonly sessionId?: string | null;
  readonly readCommitted?: boolean;
} = {}) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes("transaction_isolation")) {
      return { rowCount: 1, rows: [{ readCommitted: options.readCommitted ?? true }] };
    }
    if (sql.includes("FROM organization_memberships AS membership")) {
      expect(params).toEqual([
        target.membershipId, input.authenticatedUserId, target.organizationId,
      ]);
      const role = options.role === undefined ? "LOCATION_MANAGER" : options.role;
      return { rowCount: role === null ? 0 : 1, rows: role === null ? [] : [{ role }] };
    }
    if (sql.includes("FROM valet_sessions AS session")) {
      expect(params).toEqual([input.targetSessionId, target.organizationId, target.locationId]);
      const sessionId = options.sessionId === undefined ? input.targetSessionId : options.sessionId;
      return {
        rowCount: sessionId === null ? 0 : 1,
        rows: sessionId === null ? [] : [{ sessionId }],
      };
    }
    throw new Error("Unexpected SQL outside the accepted photo authorization fence");
  });
  return { query, transaction: { query } as unknown as PostgresTransaction };
}

describe("#309 normal photo-view entry without development activation gates", () => {
  beforeEach(() => {
    vi.mocked(authorizeLiveHistoryLocation).mockReset();
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(target);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["development", "test", "production"])(
    "authorizes approved CA/LM policy in NODE_ENV=%s without feature flags",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_ENABLED", undefined);
      vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_SCOPES", undefined);
      vi.stubEnv("DATABASE_URL", undefined);
      const { query, transaction } = fakeTransaction();
      expect(await authorizeManagementSessionPhotoView(transaction, input)).toEqual(target);
      expect(query).toHaveBeenCalledTimes(3);
    },
  );

  it("does not interpret stale local flags or database name as photo authority", async () => {
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_ENABLED", "false");
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_SCOPES", "some:old:scope:entry");
    vi.stubEnv("DATABASE_URL", "postgresql://remote.example.test/shared");
    const { transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toEqual(target);
  });

  it("runs normal QA mode with legacy MFA environment without an extra photo gate", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VAYLET_LOCAL_DISABLE_MFA", "true");
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_ENABLED", undefined);
    const { transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toEqual(target);
  });

  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE", "GUEST", null])(
    "rejects unauthorized role %s even with former flags enabled",
    async (role) => {
      vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_ENABLED", "true");
      const { query, transaction } = fakeTransaction({ role });
      expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
      expect(query).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects a revoked Staff session, entitlement or Location grant", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(null);
    const { query, transaction } = fakeTransaction();
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("denies a changed Organization/Location scope returned by live authorization", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue({
      ...target, locationId: "location-other",
    });
    const { query, transaction } = fakeTransaction();
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("rejects stale repeatable-read transactions before consulting authority", async () => {
    const { query, transaction } = fakeTransaction({ readCommitted: false });
    expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(authorizeLiveHistoryLocation).not.toHaveBeenCalled();
  });

  it("preserves Company Admin MFA step-up failure", async () => {
    const error = new MfaStepUpRequiredError();
    vi.mocked(authorizeLiveHistoryLocation).mockRejectedValueOnce(error);
    const { transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    await expect(authorizeManagementSessionPhotoView(transaction, input)).rejects.toBe(error);
  });

  it("denies wrong actor/Staff session binding before DB reads", async () => {
    const { query, transaction } = fakeTransaction();
    expect(await authorizeManagementSessionPhotoView(transaction, {
      ...input, authenticatedUserId: "other-user",
    })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([null, "foreign-visit"])(
    "rejects missing or foreign ValetSession %s", async (sessionId) => {
      const { transaction } = fakeTransaction({ sessionId });
      expect(await authorizeManagementSessionPhotoView(transaction, input)).toBeNull();
    },
  );
});

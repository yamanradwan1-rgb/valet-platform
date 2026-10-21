import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import { localMfaBypassEnabled } from "../src/modules/auth/mfa/local-mfa-bypass";
import { authorizeLiveHistoryLocation } from "../src/modules/dashboard/live-history-read-authorization";
import {
  authorizeManagementSessionPhotoView,
  type DashboardSessionPhotoViewInput,
} from "../src/modules/dashboard/session-photo-authorization";

vi.mock("../src/modules/auth/mfa/local-mfa-bypass", () => ({
  localMfaBypassEnabled: vi.fn(() => false),
}));
vi.mock("../src/modules/dashboard/live-history-read-authorization", () => ({
  authorizeLiveHistoryLocation: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const staffId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const otherUserId = "55555555-5555-4555-8555-555555555555";
const otherStaffId = "66666666-6666-4666-8666-666666666666";
const databaseName = `vlt_t_db_215_${"a".repeat(32)}`;
const runtimeRole = `vlt_t_role_215_${"b".repeat(32)}`;
const databaseUrl = `postgresql://${runtimeRole}:secret@127.0.0.1:5432/${databaseName}`;
const grantedScope = {
  organizationId: "org-A", locationId, membershipId: "membership-A",
};
const input: DashboardSessionPhotoViewInput = {
  authenticatedUserId: userId,
  targetLocationId: locationId,
  targetSessionId: sessionId,
  staffSessionContext: {
    userId, staffAuthSessionId: staffId,
    accessTokenHash: "trusted-bearer-hash",
    createdAt: new Date("2026-10-21T00:00:00Z"),
  },
};

function database(options: {
  readonly role?: string | null;
  readonly connectedDatabase?: string;
  readonly connectedRole?: string;
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("current_database()")) return {
      rowCount: 1,
      rows: [{
        databaseName: options.connectedDatabase ?? databaseName,
        runtimeRole: options.connectedRole ?? runtimeRole,
      }],
    };
    if (sql.includes("transaction_isolation"))
      return { rowCount: 1, rows: [{ readCommitted: true }] };
    if (sql.includes("FROM organization_memberships")) {
      const role = options.role === undefined ? "ORG_ADMIN" : options.role;
      return { rowCount: role === null ? 0 : 1, rows: role === null ? [] : [{ role }] };
    }
    if (sql.includes("FROM valet_sessions"))
      return { rowCount: 1, rows: [{ sessionId }] };
    throw new Error("Unexpected SQL");
  });
  return { query, tx: { query } as unknown as PostgresTransaction };
}

function scope(actor = userId, staff = staffId, location = locationId, visit = sessionId) {
  return [actor, staff, location, visit].join(":");
}

describe("#309 explicit local development photo VIEW gate", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_ENABLED", "true");
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_SCOPES", scope());
    vi.stubEnv("VAYLET_LOCAL_DISABLE_MFA", "false");
    vi.mocked(localMfaBypassEnabled).mockReturnValue(false);
    vi.mocked(authorizeLiveHistoryLocation).mockReset();
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(grantedScope);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"])(
    "allows current %s with exact Staff/Location/ValetSession in disposable PG",
    async (role) => {
      const { tx, query } = database({ role });
      expect(await authorizeManagementSessionPhotoView(tx, input)).toEqual(grantedScope);
      expect(query).toHaveBeenCalledTimes(4);
      expect(authorizeLiveHistoryLocation).toHaveBeenCalledWith(tx, {
        authenticatedUserId: userId,
        staffSessionContext: input.staffSessionContext,
        targetLocationId: locationId,
      });
    },
  );

  it("allows exactly two independently scoped local actors for CA and LM", async () => {
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_SCOPES",
      `${scope(otherUserId, otherStaffId)};${scope()}`);
    const { tx } = database({ role: "LOCATION_MANAGER" });
    expect(await authorizeManagementSessionPhotoView(tx, input)).toEqual(grantedScope);
    const second = {
      ...input, authenticatedUserId: otherUserId,
      staffSessionContext: {
        ...input.staffSessionContext,
        userId: otherUserId, staffAuthSessionId: otherStaffId,
      },
    };
    expect(await authorizeManagementSessionPhotoView(tx, second)).toEqual(grantedScope);
  });

  it.each(["production", "test", "staging", ""])(
    "denies env=%s despite opt-in and exact identities", async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      const { tx, query } = database();
      expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(["false", "1", "", "TRUE"])(
    "denies unapproved opt-in %s", async (flag) => {
      vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_ENABLED", flag);
      const { tx, query } = database();
      expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { label: "actor", input: { ...input, authenticatedUserId: otherUserId } },
    { label: "Staff session", input: { ...input, staffSessionContext: {
      ...input.staffSessionContext, staffAuthSessionId: otherStaffId,
    } } },
    { label: "Location", input: { ...input, targetLocationId: otherUserId } },
    { label: "visit", input: { ...input, targetSessionId: otherUserId } },
    { label: "unbound token user", input: { ...input, staffSessionContext: {
      ...input.staffSessionContext, userId: otherUserId,
    } } },
  ])("denies mismatched $label before accessing PostgreSQL", async (candidate) => {
    const { tx, query } = database();
    expect(await authorizeManagementSessionPhotoView(tx, candidate.input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    "not-a-scope",
    `${scope()};broken`,
    `${scope()};${scope()};${scope()}`,
    "",
    "11111111-1111-4111-8111-111111111111:bad:33333333-3333-4333-8333-333333333333:44444444-4444-4444-8444-444444444444",
  ])("rejects malformed or excessive identity allowlist %s", async (value) => {
    vi.stubEnv("ISSUE309_DEV_PHOTO_VIEW_SCOPES", value);
    const { tx, query } = database();
    expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    "postgresql://admin:secret@127.0.0.1:5432/vaylet",
    `postgresql://${runtimeRole}:secret@db.example.test:5432/${databaseName}`,
    `postgresql://${runtimeRole}:secret@127.0.0.1:5432/vaylet_prod`,
    `postgresql://${runtimeRole}:secret@127.0.0.1:5432/${databaseName}?sslmode=disable`,
    `postgresql://${runtimeRole}@127.0.0.1:5432/${databaseName}`,
    "not-a-database-url",
  ])("denies database URL outside disposable local fixture: %s", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    const { tx, query } = database();
    expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { connectedDatabase: "vaylet_prod" },
    { connectedRole: "migration_owner" },
  ])("denies connected database/role identity mismatch %o", async (options) => {
    const { tx, query } = database(options);
    expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(authorizeLiveHistoryLocation).not.toHaveBeenCalled();
  });

  it("refuses development access when MFA bypass is enabled", async () => {
    const { tx, query } = database();
    vi.stubEnv("VAYLET_LOCAL_DISABLE_MFA", "true");
    expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
    vi.stubEnv("VAYLET_LOCAL_DISABLE_MFA", "false");
    vi.mocked(localMfaBypassEnabled).mockReturnValue(true);
    expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("denies revocation of Staff, grant, subscription or Organization", async () => {
    vi.mocked(authorizeLiveHistoryLocation).mockResolvedValue(null);
    const { tx } = database();
    expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
  });

  it("preserves the current CA MFA step-up requirement", async () => {
    const error = new MfaStepUpRequiredError();
    vi.mocked(authorizeLiveHistoryLocation).mockRejectedValue(error);
    const { tx } = database();
    await expect(authorizeManagementSessionPhotoView(tx, input)).rejects.toBe(error);
  });

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", null])(
    "denies unauthorized role %s despite local opt-in", async (role) => {
      const { tx } = database({ role });
      expect(await authorizeManagementSessionPhotoView(tx, input)).toBeNull();
    },
  );
});

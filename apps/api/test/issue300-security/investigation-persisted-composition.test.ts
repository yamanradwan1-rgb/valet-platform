import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../../src/common/database/postgres";
import type { StaffSessionContext } from "../../src/modules/auth/staff-session-context";
import { requireMfaAssuranceInTransaction } from "../../src/modules/auth/mfa/mfa-assurance-policy";
import { hasManagementCommercialAccess } from "../../src/modules/management/management-commercial-access-policy";
import { ManagementAccessDeniedError } from "../../src/modules/management/management-authorization";
import { authorizeAuditInvestigationLocation } from "../../src/modules/management/audit-investigation/security/audit-investigation-authorization";

vi.mock("../../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  requireMfaAssuranceInTransaction: vi.fn(),
}));
vi.mock("../../src/modules/management/management-capabilities", () => ({
  isCompanyAdminManagementCapability: vi.fn(() => true),
}));
vi.mock("../../src/modules/management/management-commercial-access-policy", () => ({
  hasManagementCommercialAccess: vi.fn(),
}));
vi.mock("../../src/modules/management/management-authorization", () => ({
  ManagementAccessDeniedError: class ManagementAccessDeniedError extends Error {
    readonly code = "AUTHORIZATION_DENIED";
    constructor() {
      super("The requested resource is not available.");
    }
  },
}));

const commercial = vi.mocked(hasManagementCommercialAccess);
const mfa = vi.mocked(requireMfaAssuranceInTransaction);
const context: StaffSessionContext = {
  accessTokenHash: "token-hash",
  createdAt: new Date("2026-10-17T10:00:00Z"),
  staffAuthSessionId: "exact-session",
  userId: "current-user",
};
const org = "org-A";
const loc = "location-A";
const membership = { membershipId: "membership-A", organizationId: org };
const query = vi.fn();
const tx = { query } as unknown as PostgresTransaction;

function respondRole(role: string, options: { grant?: boolean } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("membership.role::text AS role"))
      return { rowCount: 1, rows: [{ role }] };
    if (sql.includes('AS "membershipId"'))
      return options.grant === false
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [membership] };
    throw new Error("Unexpected SQL query");
  });
}

describe("composes real persisted Management Audit Location guard", () => {
  beforeEach(() => {
    query.mockReset();
    commercial.mockReset().mockResolvedValue(true);
    mfa.mockReset().mockResolvedValue(undefined);
  });

  it("CA needs standard transaction MFA and current commercial grant", async () => {
    respondRole("ORG_ADMIN");
    await expect(authorizeAuditInvestigationLocation(tx, context, org, loc))
      .resolves.toEqual({ ...membership, locationId: loc, role: "ORG_ADMIN" });
    expect(mfa).toHaveBeenCalledExactlyOnceWith(tx, context, { sensitive: false });
    expect(commercial).toHaveBeenCalledExactlyOnceWith(tx, org, "DASHBOARD_ACCESS");
    expect(query.mock.calls.some(([sql]) =>
      (sql as string).includes("FOR SHARE OF membership, organization, location"),
    )).toBe(true);
  });

  it("LM uses exact persisted session/token and current location grant locks", async () => {
    respondRole("LOCATION_MANAGER");
    await expect(authorizeAuditInvestigationLocation(tx, context, org, loc))
      .resolves.toMatchObject({ locationId: loc, role: "LOCATION_MANAGER" });
    expect(mfa).not.toHaveBeenCalled();
    const call = query.mock.calls.find(([sql]) =>
      (sql as string).includes("FROM staff_auth_sessions AS session"),
    );
    expect(call).toBeDefined();
    const [sql, params] = call as [string, unknown[]];
    expect(sql).toContain("membership_location_access AS access_row");
    expect(sql).toContain("session.current_access_token_hash = $3");
    expect(sql).toContain("session.revoked_at IS NULL");
    expect(sql).toContain("clock_timestamp() < session.access_expires_at");
    expect(sql).toContain("FOR SHARE OF session, actor, membership, organization, location, access_row");
    expect(params).toEqual(["exact-session", "current-user", "token-hash", org, "LOCATION_MANAGER", loc]);
  });

  it("denies revoked/absent LM grants before source reads", async () => {
    respondRole("LOCATION_MANAGER", { grant: false });
    await expect(authorizeAuditInvestigationLocation(tx, context, org, loc))
      .rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(query.mock.calls).toHaveLength(2);
  });

  it("denies both roles when the current commercial entitlement lapses", async () => {
    respondRole("ORG_ADMIN");
    commercial.mockResolvedValue(false);
    await expect(authorizeAuditInvestigationLocation(tx, context, org, loc))
      .rejects.toBeInstanceOf(ManagementAccessDeniedError);
  });

  it("fails closed when the current CA MFA check rejects stale assurance", async () => {
    respondRole("ORG_ADMIN");
    const stale = new Error("step-up");
    mfa.mockRejectedValueOnce(stale);
    await expect(authorizeAuditInvestigationLocation(tx, context, org, loc))
      .rejects.toBe(stale);
    expect(commercial).not.toHaveBeenCalled();
  });

  it("Supervisor remains eligible for old Audit Events but not Investigation", async () => {
    respondRole("VALET_SUPERVISOR");
    await expect(authorizeAuditInvestigationLocation(tx, context, org, loc))
      .rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(mfa).not.toHaveBeenCalled();
    expect(commercial).toHaveBeenCalledOnce();
  });
});

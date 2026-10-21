import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../src/modules/auth/staff-session-revalidation";
import { requireMfaAssuranceInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import {
  authorizeCompanyAdminManagement,
  eligibleCompanyAdminLocationOrganization,
} from "../src/modules/management/management-authorization";
import { authorizeDashboardLocation } from "../src/modules/dashboard/dashboard-location-authorization";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";

vi.mock("../src/modules/auth/staff-session-revalidation", () => ({
  lockAndRecheckStaffSessionContext: vi.fn(),
}));
vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  recordAdminActivityInTransaction: vi.fn(),
  requireMfaAssuranceInTransaction: vi.fn(),
}));
vi.mock("../src/modules/management/management-authorization", () => ({
  authorizeCompanyAdminManagement: vi.fn(),
  eligibleCompanyAdminLocationOrganization: vi.fn(),
}));
vi.mock("../src/modules/dashboard/dashboard-location-authorization", () => ({
  authorizeDashboardLocation: vi.fn(),
}));

const scope = {
  organizationId: "org-a",
  locationId: "location-a",
  membershipId: "membership-a",
};
const context = { userId: "actor-a" } as StaffSessionContext;
const manager = vi.mocked(authorizeDashboardLocation);
const session = vi.mocked(lockAndRecheckStaffSessionContext);
const eligibleAdmin = vi.mocked(eligibleCompanyAdminLocationOrganization);
const admin = vi.mocked(authorizeCompanyAdminManagement);
const mfa = vi.mocked(requireMfaAssuranceInTransaction);

function transaction(events: string[]) {
  return {
    query: vi.fn(async (sql: string, values: unknown[]) => {
      events.push("lock");
      expect(sql).toContain("pg_advisory_xact_lock_shared");
      expect(sql).toContain("staff-management-org:");
      expect(sql).toContain("current_setting('transaction_isolation')");
      expect(values).toEqual(["org-a"]);
      return { rows: [{ readCommitted: true }], rowCount: 1 };
    }),
  } as unknown as PostgresTransaction;
}

beforeEach(() => {
  vi.clearAllMocks();
  eligibleAdmin.mockResolvedValue(null);
  session.mockResolvedValue({} as Awaited<ReturnType<typeof lockAndRecheckStaffSessionContext>>);
});

describe("#315 Dashboard Location Manager read fence", () => {
  it("rechecks exact LM scope after the matching org SHARED lock", async () => {
    const events: string[] = [];
    manager.mockImplementation(async () => {
      events.push("scope");
      return scope;
    });
    const result = await authorizeDashboardReadLocation(transaction(events), {
      authenticatedUserId: "actor-a",
      capability: "LOCATION_DASHBOARD_READ",
      targetLocationId: "location-a",
    });
    expect(result).toEqual(scope);
    expect(events).toEqual(["scope", "lock", "scope"]);
    expect(manager).toHaveBeenCalledTimes(2);
  });

  it("denies a revoked grant after waiting for the writer without CA promotion", async () => {
    const events: string[] = [];
    manager.mockResolvedValueOnce(scope).mockResolvedValueOnce(null);
    const result = await authorizeDashboardReadLocation(transaction(events), {
      authenticatedUserId: "actor-a",
      capability: "ANALYTICS_READ",
      targetLocationId: "location-a",
    });
    expect(result).toBeNull();
    expect(events).toEqual(["lock"]);
    expect(eligibleAdmin).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });

  it("fails closed without re-reading an obsolete repeatable-read snapshot", async () => {
    manager.mockResolvedValue(scope);
    const tx = {
      query: vi.fn(async () => ({
        rows: [{ readCommitted: false }],
        rowCount: 1,
      })),
    } as unknown as PostgresTransaction;
    expect(await authorizeDashboardReadLocation(tx, {
      authenticatedUserId: "actor-a",
      capability: "LOCATION_DASHBOARD_READ",
      targetLocationId: "location-a",
    })).toBeNull();
    expect(manager).toHaveBeenCalledTimes(1);
    expect(eligibleAdmin).not.toHaveBeenCalled();
  });

  it("fails closed if membership or organization changes across the fence", async () => {
    manager.mockResolvedValueOnce(scope).mockResolvedValueOnce({
      ...scope,
      membershipId: "membership-b",
    });
    expect(await authorizeDashboardReadLocation(transaction([]), {
      authenticatedUserId: "actor-a",
      capability: "REPORTS_READ",
      targetLocationId: "location-a",
    })).toBeNull();
    expect(admin).not.toHaveBeenCalled();
  });

  it("holds the export's Staff-session lock before the management lock", async () => {
    const events: string[] = [];
    manager.mockImplementation(async () => {
      events.push("scope");
      return scope;
    });
    session.mockImplementation(async () => {
      events.push("session");
      return {} as Awaited<ReturnType<typeof lockAndRecheckStaffSessionContext>>;
    });
    const result = await authorizeDashboardReadLocation(transaction(events), {
      authenticatedUserId: "actor-a",
      capability: "REPORT_EXPORT",
      staffSessionContext: context,
      targetLocationId: "location-a",
    });
    expect(result).toEqual(scope);
    expect(events).toEqual(["scope", "session", "lock", "scope"]);
    expect(manager).toHaveBeenNthCalledWith(
      2, expect.anything(), "actor-a", "location-a", "REPORT_EXPORTS",
    );
  });

  it("does not acquire an org lock when the required export session is invalid", async () => {
    manager.mockResolvedValue(scope);
    session.mockResolvedValue(undefined);
    const tx = transaction([]);
    expect(await authorizeDashboardReadLocation(tx, {
      authenticatedUserId: "actor-a",
      capability: "REPORT_EXPORT",
      staffSessionContext: context,
      targetLocationId: "location-a",
    })).toBeNull();
    expect(tx.query).not.toHaveBeenCalled();
  });

  it("preserves the separate MFA-gated CA path without LM advisory lock", async () => {
    manager.mockResolvedValue(null);
    eligibleAdmin.mockResolvedValue("org-a");
    admin.mockResolvedValue({ organizationId: "org-a", membershipId: "admin-member" } as Awaited<ReturnType<typeof authorizeCompanyAdminManagement>>);
    const tx = transaction([]);
    const result = await authorizeDashboardReadLocation(tx, {
      authenticatedUserId: "actor-a",
      capability: "LOCATION_DASHBOARD_READ",
      staffSessionContext: context,
      targetLocationId: "location-a",
    });
    expect(result).toEqual({ ...scope, membershipId: "admin-member" });
    expect(tx.query).not.toHaveBeenCalled();
    expect(mfa).toHaveBeenCalledTimes(1);
    expect(admin).toHaveBeenCalledTimes(1);
  });
});

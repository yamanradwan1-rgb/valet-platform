import { describe, expect, it } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { MfaStepUpRequiredError } from "../src/modules/auth/mfa/mfa-errors";
import { authorizeLiveHistoryLocation } from "../src/modules/dashboard/live-history-read-authorization";

const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";
const sessionId = "55555555-5555-4555-8555-555555555555";
const factorId = "66666666-6666-4666-8666-666666666666";
const createdAt = new Date("2026-10-09T14:00:00.000Z");
const now = new Date("2026-10-09T14:05:00.000Z");

const context: StaffSessionContext = {
  accessTokenHash: "a".repeat(64),
  createdAt,
  staffAuthSessionId: sessionId,
  userId,
};

interface RecordedQuery {
  readonly parameters: readonly unknown[];
  readonly sql: string;
}

function fakeTransaction(input: {
  readonly role: "ORG_ADMIN" | "LOCATION_MANAGER";
  readonly authorityPresent?: boolean;
  readonly sessionPresent?: boolean;
  readonly mfaFactorCurrent?: boolean;
}) {
  const calls: RecordedQuery[] = [];
  const transaction = {
    query: async (sql: string, parameters: readonly unknown[] = []) => {
      calls.push({ parameters, sql });
      if (sql.includes("staff-user-security:"))
        return { rowCount: 1, rows: [{}] };
      if (
        sql.includes("FROM staff_auth_sessions AS session") &&
        sql.includes("session.created_at")
      ) {
        return input.sessionPresent === false
          ? { rowCount: 0, rows: [] }
          : {
              rowCount: 1,
              rows: [{ created_at: createdAt, id: sessionId, user_id: userId }],
            };
      }
      if (
        sql.includes("FROM locations AS location") &&
        sql.includes("membership.role::text AS role")
      ) {
        return {
          rowCount: 1,
          rows: [{ organizationId, role: input.role }],
        };
      }
      if (
        sql.includes("FROM staff_auth_sessions AS session") &&
        sql.includes("session.mfa_authenticated_at")
      ) {
        return {
          rowCount: 1,
          rows: [
            {
              absolute_expires_at: new Date("2026-10-10T14:00:00.000Z"),
              id: sessionId,
              last_admin_activity_at: now,
              mfa_authenticated_at: now,
              mfa_factor_id: factorId,
              now,
              user_id: userId,
            },
          ],
        };
      }
      if (sql.includes("FROM user_mfa_totp_factors AS factor")) {
        return input.mfaFactorCurrent === false
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ id: factorId }] };
      }
      if (sql.includes("staff-management-org:")) {
        return { rowCount: 1, rows: [{}] };
      }
      if (sql.includes("shift_presence_lock_management_entitlement(")) {
        return { rowCount: 1, rows: [{ enabled: true }] };
      }
      if (
        sql.includes("FROM organization_memberships AS membership") &&
        sql.includes("organization_subscriptions AS subscription")
      ) {
        return input.authorityPresent === false
          ? { rowCount: 0, rows: [] }
          : {
              rowCount: 1,
              rows: [{ locationId, membershipId, organizationId }],
            };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as PostgresTransaction;
  return { calls, transaction };
}

function callIndex(calls: readonly RecordedQuery[], fragment: string): number {
  return calls.findIndex((call) => call.sql.includes(fragment));
}

describe("DEC-102 Live history read authorization", () => {
  it("locks exact LM session first, then Organization authority and exact grant/Location/subscription", async () => {
    const { calls, transaction } = fakeTransaction({
      role: "LOCATION_MANAGER",
    });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: context,
        targetLocationId: locationId,
      }),
    ).resolves.toEqual({ locationId, membershipId, organizationId });

    const userBoundary = callIndex(calls, "staff-user-security:");
    const exactSession = callIndex(calls, "session.created_at");
    const roleHint = callIndex(calls, "membership.role::text AS role");
    const organizationBoundary = callIndex(calls, "staff-management-org:");
    expect(calls[organizationBoundary]?.sql).toContain(
      "pg_advisory_xact_lock_shared",
    );
    const lockedAuthority = callIndex(
      calls,
      "organization_subscriptions AS subscription",
    );
    const entitlementGuard = callIndex(
      calls, "shift_presence_lock_management_entitlement(",
    );
    expect(userBoundary).toBeGreaterThanOrEqual(0);
    expect(calls[userBoundary]?.sql).toContain("pg_advisory_xact_lock_shared");
    expect(exactSession).toBeGreaterThan(userBoundary);
    expect(calls[exactSession]?.sql).toContain("FOR SHARE OF session");
    expect(roleHint).toBeGreaterThan(exactSession);
    expect(organizationBoundary).toBeGreaterThan(roleHint);
    expect(entitlementGuard).toBeGreaterThan(organizationBoundary);
    expect(lockedAuthority).toBeGreaterThan(entitlementGuard);
    expect(lockedAuthority).toBeGreaterThan(organizationBoundary);

    const authoritySql = calls[lockedAuthority]!.sql;
    expect(authoritySql).toContain("membership.role = $4::membership_role");
    expect(authoritySql).toContain("membership_location_access AS access");
    expect(authoritySql).toContain("location.status = 'ACTIVE'");
    expect(authoritySql).toContain(
      "subscription.dashboard_access_enabled = TRUE",
    );
    expect(authoritySql).toContain("FOR SHARE OF membership");
    expect(authoritySql).toContain(
      "FOR SHARE OF organization, location, access",
    );
    expect(
      calls.some((call) => call.sql.includes("mfa_authenticated_at")),
    ).toBe(false);
    expect(
      calls.every((call) => call.sql.trimStart().startsWith("SELECT")),
    ).toBe(true);
  });

  it("requires CA MFA after exact session and before staff-management-org, without an LM grant join", async () => {
    const { calls, transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: context,
        targetLocationId: locationId,
      }),
    ).resolves.toEqual({ locationId, membershipId, organizationId });

    const exactSession = callIndex(calls, "session.created_at");
    const mfaSession = callIndex(calls, "session.mfa_authenticated_at");
    expect(calls[mfaSession]?.sql).toContain("FOR SHARE OF session, staff_user");
    const mfaFactor = callIndex(calls, "FROM user_mfa_totp_factors AS factor");
    expect(calls[mfaFactor]?.sql).toContain("FOR SHARE OF factor");
    const organizationBoundary = callIndex(calls, "staff-management-org:");
    const lockedAuthority = callIndex(
      calls,
      "organization_subscriptions AS subscription",
    );
    expect(mfaSession).toBeGreaterThan(exactSession);
    expect(organizationBoundary).toBeGreaterThan(mfaSession);
    expect(lockedAuthority).toBeGreaterThan(organizationBoundary);
    expect(calls[lockedAuthority]!.sql).not.toContain(
      "membership_location_access AS access",
    );
    expect(calls[lockedAuthority]!.sql).toContain(
      "FOR SHARE OF organization, location",
    );
    expect(
      calls.every((call) => call.sql.trimStart().startsWith("SELECT")),
    ).toBe(true);
  });

  it("fails closed before role/scope reads when the exact Staff session is no longer current", async () => {
    const { calls, transaction } = fakeTransaction({
      role: "LOCATION_MANAGER",
      sessionPresent: false,
    });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: context,
        targetLocationId: locationId,
      }),
    ).resolves.toBeNull();
    expect(callIndex(calls, "membership.role::text AS role")).toBe(-1);
    expect(callIndex(calls, "staff-management-org:")).toBe(-1);
  });

  it("fails closed when locked current role/grant/Location/entitlement proof disappears", async () => {
    const { calls, transaction } = fakeTransaction({
      authorityPresent: false,
      role: "LOCATION_MANAGER",
    });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: context,
        targetLocationId: locationId,
      }),
    ).resolves.toBeNull();
    expect(callIndex(calls, "staff-management-org:")).toBeGreaterThanOrEqual(0);
  });

  it("hides CA MFA failure until locked Location authority is established", async () => {
    const { calls, transaction } = fakeTransaction({
      authorityPresent: false,
      mfaFactorCurrent: false,
      role: "ORG_ADMIN",
    });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: context,
        targetLocationId: locationId,
      }),
    ).resolves.toBeNull();
    const mfa = callIndex(calls, "FROM user_mfa_totp_factors AS factor");
    const authority = callIndex(
      calls,
      "organization_subscriptions AS subscription",
    );
    expect(mfa).toBeGreaterThanOrEqual(0);
    expect(authority).toBeGreaterThan(mfa);
  });

  it("emits MFA step-up only after proving current locked CA authority", async () => {
    const { calls, transaction } = fakeTransaction({
      mfaFactorCurrent: false,
      role: "ORG_ADMIN",
    });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: context,
        targetLocationId: locationId,
      }),
    ).rejects.toBeInstanceOf(MfaStepUpRequiredError);
    expect(
      callIndex(calls, "organization_subscriptions AS subscription"),
    ).toBeGreaterThan(callIndex(calls, "FROM user_mfa_totp_factors AS factor"));
  });

  it("rejects a session context belonging to another User before acquiring locks", async () => {
    const { calls, transaction } = fakeTransaction({ role: "ORG_ADMIN" });
    await expect(
      authorizeLiveHistoryLocation(transaction, {
        authenticatedUserId: userId,
        staffSessionContext: { ...context, userId: locationId },
        targetLocationId: locationId,
      }),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});

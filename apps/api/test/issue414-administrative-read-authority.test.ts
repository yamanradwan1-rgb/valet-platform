import { describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { ManagementAccessDeniedError } from "../src/modules/management/management-authorization";
import {
  authorizeForceEndedShiftAlert,
  authorizeStaffSecurityAlert,
} from "../src/modules/dashboard/management-alert-sources/administrative-occurrence-authority";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const context = {
  userId,
  staffAuthSessionId: "55555555-5555-4555-8555-555555555555",
  rawAccessToken: "vsa1." + "A".repeat(43),
  createdAt: new Date("2026-11-04T00:00:00Z"),
};
type Role = "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR";
type Scenario = {
  initialRole?: Role;
  currentRole?: Role;
  activeSession?: boolean;
  postLockSession?: boolean;
  validMfa?: boolean;
  postLockMfa?: boolean;
  readCommitted?: boolean;
  entitled?: boolean;
  activeLocation?: boolean;
  locationGrant?: boolean;
};

function scriptedDatabase(s: Scenario = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  let sessionReads = 0;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("public.staff_auth_lock_current_session(")) {
      expect(params).toEqual([
        context.staffAuthSessionId,
        context.userId,
        context.rawAccessToken,
        context.createdAt,
        "SHARED",
      ]);
      sessionReads += 1;
      const valid =
        sessionReads === 1
          ? s.activeSession !== false
          : s.postLockSession !== false;
      const validMfa =
        sessionReads === 1 ? s.validMfa !== false : s.postLockMfa !== false;
      if (!valid) return { rows: [], rowCount: 0 };
      const now = new Date();
      return {
        rowCount: 1,
        rows: [
          {
            id: context.staffAuthSessionId,
            user_id: context.userId,
            created_at: context.createdAt,
            absolute_expires_at: new Date(now.getTime() + 60_000),
            mfa_factor_id: validMfa ? membershipId : null,
            mfa_authenticated_at: validMfa
              ? new Date(now.getTime() - 1_000)
              : null,
            last_admin_activity_at: validMfa
              ? new Date(now.getTime() - 1_000)
              : null,
            checked_at: now,
          },
        ],
      };
    }
    if (sql.includes("FROM user_mfa_totp_factors AS factor")) {
      expect(params).toEqual([membershipId, context.userId]);
      const valid =
        sessionReads === 1 ? s.validMfa !== false : s.postLockMfa !== false;
      return { rowCount: valid ? 1 : 0, rows: valid ? [{}] : [] };
    }
    if (sql.includes("SELECT 1 FROM organization_memberships AS membership")) {
      const valid = (params[2] as string[]).includes(
        s.initialRole ?? "ORG_ADMIN",
      );
      return { rows: valid ? [{}] : [], rowCount: valid ? 1 : 0 };
    }
    if (sql.includes("pg_advisory_xact_lock_shared")) {
      return {
        rows: [{ readCommitted: s.readCommitted !== false }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM organization_memberships AS membership")) {
      const valid =
        s.entitled !== false &&
        (params[2] as string[]).includes(s.currentRole ?? "ORG_ADMIN");
      return {
        rows: valid
          ? [{ role: s.currentRole ?? "ORG_ADMIN", membershipId }]
          : [],
        rowCount: valid ? 1 : 0,
      };
    }
    if (sql.includes("FROM membership_location_access")) {
      return {
        rows: s.locationGrant === false ? [] : [{}],
        rowCount: s.locationGrant === false ? 0 : 1,
      };
    }
    if (sql.includes("FROM locations")) {
      return {
        rows: s.activeLocation === false ? [] : [{}],
        rowCount: s.activeLocation === false ? 0 : 1,
      };
    }
    throw new Error(`Unexpected administrative alert SQL: ${sql}`);
  };
  return {
    tx: { query } as unknown as PostgresTransaction,
    statements,
  };
}

const readShift = (tx: PostgresTransaction) =>
  authorizeForceEndedShiftAlert(tx, {
    context,
    organizationId,
    locationId,
    limit: 21,
  });
const readStaff = (tx: PostgresTransaction) =>
  authorizeStaffSecurityAlert(tx, {
    context,
    organizationId,
    limit: 21,
  });

describe("Issue #414 read-only administrative source authorization", () => {
  it("uses concurrent SHARE row locks before SHARED org fence, and revalidates afterward", async () => {
    const db = scriptedDatabase();
    await readShift(db.tx);
    const sql = db.statements.map((entry) => entry.sql);
    const lock = sql.findIndex((s) =>
      s.includes("pg_advisory_xact_lock_shared"),
    );
    expect(lock).toBeGreaterThan(0);
    expect(
      sql.filter((s) => s.includes("public.staff_auth_lock_current_session(")),
    ).toHaveLength(2);
    expect(sql[0]).toContain("public.staff_auth_lock_current_session(");
    expect(sql[0]).not.toContain("current_access_token_hash");
    expect(sql[lock + 1]).toContain("public.staff_auth_lock_current_session(");
    expect(sql[lock + 2]).toContain("FROM user_mfa_totp_factors AS factor");
    expect(sql[lock + 3]).toContain("FOR SHARE OF membership, organization");
    expect(sql[lock + 3]).not.toContain("FOR SHARE OF subscription");
    expect(sql[lock + 3]).toContain(
      "subscription.dashboard_access_enabled=TRUE",
    );
    expect(sql.at(-1)).toContain("FROM locations");
    expect(sql.every((s) => !/pg_advisory_xact_lock\(/.test(s))).toBe(true);
    expect(sql.every((s) => !/FOR UPDATE/.test(s))).toBe(true);
    expect(
      sql.every((s) => !/staff_management_set_|audit_events/.test(s)),
    ).toBe(true);
  });

  it("allows an exact-granted LM Shift source without opening CA staff audit", async () => {
    const db = scriptedDatabase({
      initialRole: "LOCATION_MANAGER",
      currentRole: "LOCATION_MANAGER",
    });
    await readShift(db.tx);
    expect(db.statements.at(-1)?.sql).toContain(
      "FOR SHARE OF access, location",
    );
    expect(db.statements.at(-1)?.params).toEqual([
      organizationId,
      membershipId,
      locationId,
    ]);
    const staff = scriptedDatabase({
      initialRole: "LOCATION_MANAGER",
      currentRole: "LOCATION_MANAGER",
    });
    await expect(readStaff(staff.tx)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
    expect(staff.statements.some((s) => s.sql.includes("pg_advisory"))).toBe(
      false,
    );
  });

  it.each([
    [
      "revoked exact LM grant",
      {
        initialRole: "LOCATION_MANAGER",
        currentRole: "LOCATION_MANAGER",
        locationGrant: false,
      },
    ],
    ["deactivated chosen Location", { activeLocation: false }],
    ["downgraded role after shared fence", { currentRole: "VALET_SUPERVISOR" }],
    ["revoked subscription after shared fence", { entitled: false }],
    ["invalid refreshed session", { postLockSession: false }],
    ["expired MFA while waiting", { postLockMfa: false }],
    ["old MVCC snapshot", { readCommitted: false }],
    ["no active session", { activeSession: false }],
    ["no MFA", { validMfa: false }],
    ["foreign Organization hint", { initialRole: "VALET_SUPERVISOR" }],
  ] as const)("%s denies without source selection", async (_label, options) => {
    const db = scriptedDatabase(options);
    await expect(readShift(db.tx)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
    expect(db.statements.some((s) => s.sql.includes("FROM audit_events"))).toBe(
      false,
    );
  });

  it("grants ALT15 only to MFA-assured active CA and rejects demotion", async () => {
    await readStaff(scriptedDatabase().tx);
    const demoted = scriptedDatabase({ currentRole: "LOCATION_MANAGER" });
    await expect(readStaff(demoted.tx)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
    const revoked = scriptedDatabase({ postLockSession: false });
    await expect(readStaff(revoked.tx)).rejects.toBeInstanceOf(
      ManagementAccessDeniedError,
    );
  });

  it("rejects malformed Organization and Location without querying source", async () => {
    const db = scriptedDatabase();
    await expect(
      authorizeForceEndedShiftAlert(db.tx, {
        context,
        organizationId,
        locationId: "foreign",
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    await expect(
      authorizeStaffSecurityAlert(db.tx, {
        context,
        organizationId: "foreign",
        limit: 21,
      }),
    ).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(db.statements).toHaveLength(0);
  });
});

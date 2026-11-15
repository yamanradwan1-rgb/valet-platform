import { describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import { StaffAuthService, STAFF_AUTH_DUMMY_PASSWORD_HASH } from "../src/modules/auth/staff-auth.service";
import { generateStaffCredential, staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { AntiAbuseReservation } from "../src/modules/anti-abuse/anti-abuse.service";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const refreshId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-11-15T18:00:00.000Z");
const accessExpiresAt = new Date(now.getTime() + 15 * 60_000);
const absoluteExpiresAt = new Date(now.getTime() + 720 * 3600_000);

function writerHarness(
  respond: (sql: string, params: readonly unknown[] | undefined) => unknown,
) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => ({
    rowCount: 1,
    rows: sql === "SELECT clock_timestamp() AS now" ? [{ now }] :
      (respond(sql, params) as unknown[]) ?? [],
  }));
  const release = vi.fn();
  const writer = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresPool;
  return { writer, query, release };
}

describe("S01 dedicated writer transaction and role isolation", () => {
  it("login's session, refresh, User and limiter writes all share the protected transaction", async () => {
    const readerQuery = vi.fn(async () => ({
      rowCount: 1,
      rows: [{ id: userId, password_hash: STAFF_AUTH_DUMMY_PASSWORD_HASH, status: "ACTIVE" }],
    }));
    const reader = { query: readerQuery } as unknown as PostgresPool;
    const { writer, query, release } = writerHarness((sql) => {
      if (sql.includes("FROM users WHERE id = $1 FOR UPDATE")) {
        return [{ password_hash: STAFF_AUTH_DUMMY_PASSWORD_HASH, status: "ACTIVE" }];
      }
      if (sql.includes("INSERT INTO staff_auth_sessions")) {
        return [{ id: sessionId, access_expires_at: accessExpiresAt,
          absolute_expires_at: absoluteExpiresAt,
          refresh_cookie_max_age_seconds: 2_592_000 }];
      }
      if (sql.includes("s04_staff_login_success")) return [{ finalized: 1 }];
      return [];
    });
    const service = new StaffAuthService(reader, { verify: vi.fn(async () => true) }, writer);
    const reservation = {
      id: refreshId,
      key: {
        scope: "v1:staff-login-identifier", keyHash: "a".repeat(64),
        lockHigh: 1, lockLow: 2,
      },
    } as AntiAbuseReservation;
    const issued = await service.login("staff@example.test", "presented-password", reservation);
    expect(issued.accessToken).toMatch(/^vsa1\./);
    expect(issued.refreshToken).toMatch(/^vsr1\./);
    expect(issued.staffAuthSessionId).toBe(sessionId);
    expect(readerQuery).toHaveBeenCalledTimes(1);
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements).toContain("BEGIN");
    expect(statements).toContain("COMMIT");
    expect(statements).toContainEqual(expect.stringContaining("INSERT INTO staff_auth_sessions"));
    expect(statements).toContainEqual(expect.stringContaining("INSERT INTO staff_refresh_credentials"));
    expect(statements).toContainEqual(expect.stringContaining("UPDATE users SET last_login_at"));
    expect(statements).toContainEqual(expect.stringContaining(
      "SELECT public.s04_staff_login_success($1::uuid,$2::text)",
    ));
    expect(query.mock.calls.find(([sql]) => sql.includes("s04_staff_login_success"))?.[1])
      .toEqual([refreshId, "a".repeat(64)]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("refresh consumes old credential and rotates both hashes in one protected transaction", async () => {
    const raw = generateStaffCredential("vsr1.");
    const { writer, query } = writerHarness((sql, params) => {
      if (sql.includes("SELECT session.user_id")) {
        expect(params).toEqual([staffCredentialHash("refresh", raw)]);
        return [{ user_id: userId }];
      }
      if (sql.includes("FOR UPDATE OF refresh, session, staff_user")) {
        return [{
          id: refreshId, session_id: sessionId, generation: 1,
          expires_at: absoluteExpiresAt, consumed_at: null,
          absolute_expires_at: absoluteExpiresAt, revoked_at: null, status: "ACTIVE",
        }];
      }
      if (sql.includes("UPDATE staff_auth_sessions")) return [{
        id: sessionId, access_expires_at: accessExpiresAt,
        absolute_expires_at: absoluteExpiresAt,
        refresh_cookie_max_age_seconds: 2_592_000,
      }];
      return [];
    });
    const readerQuery = vi.fn();
    const service = new StaffAuthService(
      { query: readerQuery } as unknown as PostgresPool,
      { verify: async () => false }, writer,
    );
    const rotated = await service.refresh(raw);
    expect(rotated.accessToken).toMatch(/^vsa1\./);
    expect(rotated.refreshToken).toMatch(/^vsr1\./);
    expect(readerQuery).not.toHaveBeenCalled();
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements).toContainEqual(expect.stringContaining("SET consumed_at ="));
    expect(statements).toContainEqual(expect.stringContaining("INSERT INTO staff_refresh_credentials"));
    expect(statements).toContainEqual(expect.stringContaining("SET replaced_by_credential_id"));
    expect(statements).toContainEqual(expect.stringContaining("SET current_access_token_hash"));
    expect(statements).toContain("COMMIT");
  });

  it("logout writes irrevocable revocation and PUSH retirement on writer, never the runtime pool", async () => {
    const raw = generateStaffCredential("vsr1.");
    const { writer, query } = writerHarness((sql) =>
      sql.includes("SELECT refresh.session_id") ? [{ session_id: sessionId }] : [],
    );
    const runtimeQuery = vi.fn();
    const service = new StaffAuthService(
      { query: runtimeQuery } as unknown as PostgresPool,
      { verify: async () => false }, writer,
    );
    await service.logout(raw);
    expect(runtimeQuery).not.toHaveBeenCalled();
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements).toContainEqual(expect.stringContaining("SET revoked_at = COALESCE"));
    expect(statements).toContainEqual(expect.stringContaining("UPDATE staff_push_registrations"));
    expect(statements).toContain("COMMIT");
  });
});

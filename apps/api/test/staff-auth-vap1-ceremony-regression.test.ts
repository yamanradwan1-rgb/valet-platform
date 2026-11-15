import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import {
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
  StaffAuthService,
} from "../src/modules/auth/staff-auth.service";

const userId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const refreshId = "00000000-0000-4000-8000-000000000003";

describe("Staff login/refresh ceremony source regressions (legacy SQL, NOT VAP1)", () => {
  it("rechecks an app-verified password hash under User lock before writes", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    const release = vi.fn();
    const lockedQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM users WHERE id = $1 FOR UPDATE")) {
        return {
          rowCount: 1,
          rows: [{ status: "ACTIVE", password_hash: "changed-after-verify" }],
        };
      }
      return { rowCount: 0, rows: [] };
    });
    const pool = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [
          {
            id: userId,
            password_hash: STAFF_AUTH_DUMMY_PASSWORD_HASH,
            status: "ACTIVE",
          },
        ],
      }),
      connect: vi.fn(async () => ({ query: lockedQuery, release })),
    } as unknown as PostgresPool;
    const auth = new StaffAuthService(pool, { verify });

    await expect(
      auth.login("staff@example.test", "presented-password"),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    expect(verify).toHaveBeenCalledExactlyOnceWith(
      STAFF_AUTH_DUMMY_PASSWORD_HASH,
      "presented-password",
    );
    const statements = lockedQuery.mock.calls.map(([sql]) => sql);
    expect(
      statements.some((sql) => sql.includes("pg_advisory_xact_lock")),
    ).toBe(true);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(
      statements.some((sql) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)),
    ).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("commits consumed-refresh family revocation before returning authentication failure", async () => {
    const rawRefresh = generateStaffCredential("vsr1.");
    const expectedLookup = staffCredentialHash("refresh", rawRefresh);
    const released = vi.fn();
    const time = new Date("2026-11-13T12:00:00.000Z");
    const lockedQuery = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("SELECT session.user_id")) {
        expect(params).toEqual([expectedLookup]);
        return { rowCount: 1, rows: [{ user_id: userId }] };
      }
      if (
        sql.includes("FROM staff_refresh_credentials AS refresh") &&
        sql.includes("FOR UPDATE OF refresh, session, staff_user")
      ) {
        expect(params).toEqual([expectedLookup]);
        return {
          rowCount: 1,
          rows: [
            {
              id: refreshId,
              session_id: sessionId,
              consumed_at: time,
            },
          ],
        };
      }
      if (sql.includes("clock_timestamp() AS now")) {
        return { rowCount: 1, rows: [{ now: time }] };
      }
      return { rowCount: 0, rows: [] };
    });
    const pool = {
      connect: vi.fn(async () => ({ query: lockedQuery, release: released })),
    } as unknown as PostgresPool;
    const auth = new StaffAuthService(pool, { verify: vi.fn() });

    await expect(auth.refresh(rawRefresh)).rejects.toMatchObject({
      code: "STAFF_AUTHENTICATION_FAILED",
    });
    const statements = lockedQuery.mock.calls.map(([sql]) => sql);
    expect(
      statements.some(
        (sql) =>
          sql.includes("UPDATE staff_auth_sessions") &&
          sql.includes("revoked_at"),
      ),
    ).toBe(true);
    expect(statements).toContain("COMMIT");
    expect(statements).not.toContain("ROLLBACK");
    expect(statements.some((sql) => /\bINSERT\b/i.test(sql))).toBe(false);
    expect(released).toHaveBeenCalledTimes(1);
  });
});

import { expect, vi } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";

export const isolationAtQuery = new WeakMap<object, string>();

export const lmScope = {
  organizationId: "org-315",
  membershipId: "lm-315",
  locationId: "loc-315",
};
const rawAccessToken = `vsa1.${"H".repeat(43)}`;
export const staffContext = {
  createdAt: new Date("2026-07-10T00:00:00.000Z"),
  rawAccessToken,
  staffAuthSessionId: "session-315",
  userId: "user-315",
};

export function simulatedPostgres({
  factorActive = true,
}: { factorActive?: boolean } = {}) {
  const events: string[] = [];
  const transactions: Array<{ isolation: string }> = [];
  const pool = {
    connect: vi.fn(async () => {
      const state = { isolation: "read committed" };
      let inTransaction = false;
      let sharedAdvisoryHeld = false;
      transactions.push(state);
      const connection = {
        query: vi.fn(async (sql: string, values?: unknown[]) => {
          if (sql.includes("INNER JOIN user_mfa_totp_factors AS factor")) {
            expect(inTransaction).toBe(true);
            expect(sql).toContain("factor.state = 'ACTIVE'");
            expect(sql).not.toContain("FOR UPDATE");
            expect(values).toEqual([
              "session-315",
              "user-315",
              staffContext.createdAt,
            ]);
            events.push("mfa-factor-current-check");
            return {
              rowCount: factorActive ? 1 : 0,
              rows: factorActive ? [{ id: "factor-315" }] : [],
            };
          } else if (
            sql.startsWith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
          ) {
            expect(inTransaction).toBe(true);
            state.isolation = "repeatable read";
            isolationAtQuery.set(connection, state.isolation);
            events.push("repeatable-read");
          } else if (sql.includes("pg_advisory_lock_shared(")) {
            expect(inTransaction).toBe(false);
            expect(values).toEqual([lmScope.organizationId]);
            sharedAdvisoryHeld = true;
            events.push("shared-org-lock");
          } else if (sql.includes("pg_advisory_unlock_shared(")) {
            expect(inTransaction).toBe(false);
            expect(sharedAdvisoryHeld).toBe(true);
            expect(values).toEqual([lmScope.organizationId]);
            sharedAdvisoryHeld = false;
            events.push("shared-org-unlock");
            return { rowCount: 1, rows: [{ released: true }] };
          } else if (sql.includes("pg_advisory_xact_lock_shared")) {
            events.push("transaction-shared-lock");
            expect(values).toEqual([lmScope.organizationId]);
            return {
              rowCount: 1,
              rows: [{ readCommitted: state.isolation === "read committed" }],
            };
          } else if (sql === "BEGIN") {
            inTransaction = true;
            state.isolation = "read committed";
            isolationAtQuery.set(connection, state.isolation);
            events.push("begin");
          } else if (sql === "COMMIT" || sql === "ROLLBACK") {
            inTransaction = false;
            events.push(sql.toLowerCase());
          }
          return { rowCount: 0, rows: [] };
        }),
        release: vi.fn(),
      };
      isolationAtQuery.set(connection, state.isolation);
      return connection;
    }),
  };
  return { pool: pool as unknown as PostgresPool, events, transactions };
}

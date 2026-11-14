import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import {
  generateStaffCredential,
  refreshTokenPattern,
  staffCredentialHash,
} from "../src/modules/auth/staff-auth-credential";
import { logoutStaffSession } from "../src/modules/auth/staff-auth-logout";
import { StaffAuthService } from "../src/modules/auth/staff-auth.service";
import { hashSubmittedStaffRefresh } from "../src/modules/auth/staff-auth-vap1-refresh";

function emptyTransactionPool() {
  const query = vi.fn(
    async (statement: string, values?: readonly unknown[]) => {
      void statement;
      void values;
      return { rowCount: 0, rows: [] };
    },
  );
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return {
    pool: { connect } as unknown as PostgresPool,
    query,
    connect,
    release,
  };
}

describe("source-only Staff refresh possession lookup (not VAP1 proof)", () => {
  it("derives only the existing versioned lookup hash from a genuine raw vsr1", () => {
    const raw = generateStaffCredential("vsr1.");
    expect(hashSubmittedStaffRefresh(raw)).toBe(
      staffCredentialHash("refresh", raw),
    );
  });

  it("rejects stored SQL verifier, session ID and alternate transport token", () => {
    const raw = generateStaffCredential("vsr1.");
    for (const supplied of [
      undefined,
      "",
      staffCredentialHash("refresh", raw),
      "00000000-0000-4000-8000-000000000001",
      generateStaffCredential("vsa1."),
      `Bearer ${raw}`,
    ]) {
      expect(hashSubmittedStaffRefresh(supplied)).toBeUndefined();
    }
  });

  it("rejects base64url aliases with unused nonzero trailing bits", () => {
    const canonical = `vsr1.${"A".repeat(43)}`;
    const alias = `${canonical.slice(0, -1)}B`;
    expect(refreshTokenPattern.test(alias)).toBe(true);
    expect(Buffer.from(alias.slice(5), "base64url")).toEqual(
      Buffer.from(canonical.slice(5), "base64url"),
    );
    expect(hashSubmittedStaffRefresh(canonical)).toBe(
      staffCredentialHash("refresh", canonical),
    );
    expect(hashSubmittedStaffRefresh(alias)).toBeUndefined();
  });

  it("refresh rejects noncanonical raw input without leasing or mutating SQL", async () => {
    const { pool, connect } = emptyTransactionPool();
    const service = new StaffAuthService(pool, { verify: vi.fn() });
    await expect(
      service.refresh(`vsr1.${"A".repeat(42)}B`),
    ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("logout stays non-disclosing/no-op for malformed credentials", async () => {
    const { pool, connect } = emptyTransactionPool();
    await logoutStaffSession(pool, `vsr1.${"A".repeat(42)}B`);
    await logoutStaffSession(pool, undefined);
    expect(connect).not.toHaveBeenCalled();
  });

  it("logout lookup binds the raw-submitted hash, not a caller session ID", async () => {
    const raw = generateStaffCredential("vsr1.");
    const { pool, query, connect, release } = emptyTransactionPool();
    await logoutStaffSession(pool, raw);
    expect(connect).toHaveBeenCalledTimes(1);
    const lookup = query.mock.calls.find(([statement]) =>
      statement.includes("WHERE refresh.token_hash = $1"),
    );
    expect(lookup?.[1]).toEqual([staffCredentialHash("refresh", raw)]);
    expect(query.mock.calls.some(([, params]) => params?.includes(raw))).toBe(
      false,
    );
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("refresh lookup derives the same raw credential hash before any mutation", async () => {
    const raw = generateStaffCredential("vsr1.");
    const { pool, query } = emptyTransactionPool();
    const service = new StaffAuthService(pool, { verify: vi.fn() });
    await expect(service.refresh(raw)).rejects.toMatchObject({
      code: "STAFF_AUTHENTICATION_FAILED",
    });
    const lookup = query.mock.calls.find(([statement]) =>
      statement.includes("WHERE refresh.token_hash = $1"),
    );
    expect(lookup?.[1]).toEqual([staffCredentialHash("refresh", raw)]);
    expect(query.mock.calls.some(([, params]) => params?.includes(raw))).toBe(
      false,
    );
    expect(
      query.mock.calls.some(([statement]) =>
        /\b(INSERT|UPDATE|DELETE)\b/i.test(statement),
      ),
    ).toBe(false);
  });
});

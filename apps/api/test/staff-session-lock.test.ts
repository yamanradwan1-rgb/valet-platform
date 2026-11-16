import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import {
  lockStaffSessionWithBearer,
  resolveStaffSessionWithBearer,
} from "../src/modules/auth/staff-session-lock";
import { DatabaseStaffSessionContextResolver } from "../src/modules/auth/staff-session-context";

const raw = `vsa1.${"A".repeat(43)}`;
const createdAt = new Date("2026-11-16T12:00:00.000Z");
const row = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: "20000000-0000-4000-8000-000000000002",
  created_at: createdAt,
  absolute_expires_at: new Date("2026-11-17T12:00:00.000Z"),
  mfa_authenticated_at: null,
  mfa_factor_id: null,
  last_admin_activity_at: null,
  checked_at: new Date("2026-11-16T12:01:00.000Z"),
};

function poolWith(rows: readonly (typeof row)[]) {
  const query = vi.fn().mockResolvedValue({ rowCount: rows.length, rows });
  return { pool: { query } as unknown as PostgresPool, query };
}

describe("Staff session lock authority", () => {
  it("uses NULL identity only for initial SHARED bearer resolution", async () => {
    const fixture = poolWith([row]);
    await expect(
      resolveStaffSessionWithBearer(fixture.pool, raw),
    ).resolves.toEqual(row);
    expect(fixture.query).toHaveBeenCalledWith(
      expect.stringContaining("staff_auth_lock_current_session"),
      [null, null, raw, null, "SHARED"],
    );
  });

  it("passes exact identity and EXCLUSIVE mode for an authoritative recheck", async () => {
    const fixture = poolWith([row]);
    const context = {
      createdAt,
      rawAccessToken: raw,
      staffAuthSessionId: row.id,
      userId: row.user_id,
    };
    await expect(
      lockStaffSessionWithBearer(fixture.pool, context, "EXCLUSIVE"),
    ).resolves.toEqual(row);
    expect(fixture.query).toHaveBeenCalledWith(expect.any(String), [
      row.id,
      row.user_id,
      raw,
      createdAt,
      "EXCLUSIVE",
    ]);
  });

  it("rejects malformed bearer input before SQL", async () => {
    const fixture = poolWith([]);
    await expect(
      resolveStaffSessionWithBearer(fixture.pool, "bad"),
    ).resolves.toBeUndefined();
    expect(fixture.query).not.toHaveBeenCalled();
  });

  it("treats an empty definer result as invalid authority", async () => {
    const fixture = poolWith([]);
    await expect(
      resolveStaffSessionWithBearer(fixture.pool, raw),
    ).resolves.toBeUndefined();
  });
});

describe("DatabaseStaffSessionContextResolver", () => {
  it("keeps raw bearer non-enumerable and emits no stored verifier", async () => {
    const fixture = poolWith([row]);
    const resolver = new DatabaseStaffSessionContextResolver(fixture.pool);
    const context = await resolver.resolve(`Bearer ${raw}`);
    expect(context.rawAccessToken).toBe(raw);
    expect(Object.keys(context)).toEqual([
      "createdAt",
      "staffAuthSessionId",
      "userId",
    ]);
    expect({ ...context }).not.toHaveProperty("rawAccessToken");
    expect(JSON.stringify(context)).not.toContain(raw);
    expect(context).not.toHaveProperty("accessTokenHash");
  });

  it("fails closed when the definer rejects the bearer", async () => {
    const fixture = poolWith([]);
    const resolver = new DatabaseStaffSessionContextResolver(fixture.pool);
    await expect(resolver.resolve(`Bearer ${raw}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

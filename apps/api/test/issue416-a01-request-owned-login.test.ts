import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { AntiAbuseUnavailableError } from "../src/modules/anti-abuse/anti-abuse.service";
import {
  Issue416A01ProtectedLogin,
} from "../src/modules/auth/vap1/issue416-a01-protected-login";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { StaffAuthenticationError } from "../src/modules/auth/staff-auth-types";

const USER_ID = "00000000-0000-4000-8000-000000000002";
const LIMITER_ID = "00000000-0000-4000-8000-000000000003";
const RAW = "Real A01 Argon2 password, not a PHC";
const email = "a01@example.invalid";
const keyHash = "anti-abuse-hmac-sha256:v1:" + "a".repeat(64);
const limiter = {
  id: LIMITER_ID,
  key: {
    scope: "v1:staff-login-identifier" as const,
    keyHash,
    lockHigh: 1,
    lockLow: 2,
  },
};
let phc: string;
const previousAudience = process.env.VAYLET_AUTH_PROOF_AUDIENCE;
const previousKeyring = process.env.VAYLET_AUTH_PROOF_KEYRING_JSON;

beforeAll(async () => {
  phc = await hashStaffPassword(RAW);
});
afterEach(() => {
  if (previousAudience === undefined) delete process.env.VAYLET_AUTH_PROOF_AUDIENCE;
  else process.env.VAYLET_AUTH_PROOF_AUDIENCE = previousAudience;
  if (previousKeyring === undefined) delete process.env.VAYLET_AUTH_PROOF_KEYRING_JSON;
  else process.env.VAYLET_AUTH_PROOF_KEYRING_JSON = previousKeyring;
});

function fixture(options: {
  user?: { id: string; password_hash: string | null; status: string };
  lockedUser?: { password_hash: string | null; status: string };
  failBind?: boolean;
} = {}) {
  const queries: string[] = [];
  const lease = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("a01_bind_limiter")) {
        return { rows: [{ bound: !options.failBind }], rowCount: 1 };
      }
      if (sql.includes("pg_advisory_xact_lock")) {
        return { rows: [{}], rowCount: 1 };
      }
      if (sql.includes("FOR UPDATE")) {
        return {
          rows: options.lockedUser === undefined
            ? [{ password_hash: phc, status: "ACTIVE" }]
            : [options.lockedUser],
          rowCount: 1,
        };
      }
      if (sql.includes("a01_prepare")) {
        // An attacker-controllable SQL result must not authorize signing.
        return { rows: [{
          challenge_id: LIMITER_ID,
          proof_bytes: Buffer.from("forged challenge"),
          payload_bytes: Buffer.alloc(1),
          state_bytes: Buffer.alloc(1),
          key_id: "forged",
          key_promotion_epoch: "1",
          backend_pid: 300,
          full_xid: "42",
        }], rowCount: 1 };
      }
      if (sql.includes("pg_backend_pid()")) {
        return { rows: [{ backend_pid: 300, full_xid: "42" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => lease),
    query: vi.fn(async () => ({
      rows: options.user === undefined
        ? [{ id: USER_ID, password_hash: phc, status: "ACTIVE" }]
        : [options.user],
      rowCount: 1,
    })),
  } as unknown as PostgresPool;
  return { pool, queries, lease };
}

describe("Issue416 A01 isolated purpose-fixed issuer guard", () => {
  it("refuses missing deployment audience before touching the pool", async () => {
    delete process.env.VAYLET_AUTH_PROOF_AUDIENCE;
    const { pool } = fixture();
    await expect(
      new Issue416A01ProtectedLogin(pool).login(email, RAW, limiter),
    ).rejects.toThrow(AntiAbuseUnavailableError);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("requires the pre-domain limiter to bind and COMMIT before real Argon2", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture({ failBind: true });
    await expect(
      new Issue416A01ProtectedLogin(pool).login(email, RAW, limiter),
    ).rejects.toThrow(AntiAbuseUnavailableError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects a PHC supplied as the raw password without invoking prepare", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture();
    await expect(
      new Issue416A01ProtectedLogin(pool).login(email, phc, limiter),
    ).rejects.toThrow(StaffAuthenticationError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(false);
  });

  it("does not sign after a locked password-version change", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture({
      lockedUser: { password_hash: await hashStaffPassword(RAW), status: "ACTIVE" },
    });
    await expect(
      new Issue416A01ProtectedLogin(pool).login(email, RAW, limiter),
    ).rejects.toThrow(StaffAuthenticationError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(false);
  });

  it("rejects forged SQL frame bytes even after a genuine password", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture();
    await expect(
      new Issue416A01ProtectedLogin(pool).login(email, RAW, limiter),
    ).rejects.toThrow(AntiAbuseUnavailableError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(true);
    expect(queries.some((sql) => sql.includes("a01_execute"))).toBe(false);
  });

  it("is not wired to a public route, nor does it expose a generic signer", () => {
    const source = readFileSync(resolve(
      process.cwd(), "src/modules/auth/vap1/issue416-a01-protected-login.ts",
    ), "utf8");
    const module = readFileSync(resolve(
      process.cwd(), "src/modules/auth/auth.module.ts",
    ), "utf8");
    expect(module).not.toContain("Issue416A01ProtectedLogin");
    expect(source).not.toMatch(/export (?:async )?function (?:sign|mac|loadKey)/);
    expect(source).not.toMatch(/\b(?:createHash|createHmac)\([^)]*password/);
  });
});

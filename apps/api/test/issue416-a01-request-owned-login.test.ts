import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import type { ApiRequest } from "../src/common/http/api-request";
import { AntiAbuseUnavailableError } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  Issue416A01ProtectedLogin,
} from "../src/modules/auth/vap1/issue416-a01-protected-login";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { StaffAuthenticationError } from "../src/modules/auth/staff-auth-types";
import { Issue416A01RequestFingerprint } from "../src/modules/auth/vap1/issue416-a01-request-fingerprint";

const USER_ID = "00000000-0000-4000-8000-000000000002";
const LIMITER_ID = "00000000-0000-4000-8000-000000000003";
const RAW = "Real A01 Argon2 password, not a PHC";
const email = "a01@example.invalid";
const limiter = () => ({
  id: LIMITER_ID,
  key: new AntiAbuseKeyDeriver().derive("v1:staff-login-identifier", email),
});
let phc: string;
const previousAudience = process.env.VAYLET_AUTH_PROOF_AUDIENCE;
const previousKeyring = process.env.VAYLET_AUTH_PROOF_KEYRING_JSON;
const previousAntiAbuseSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
const previousTrustedProxies = process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
const request = { socket: { remoteAddress: "192.0.2.41" } } as ApiRequest;
const makeService = (pool: PostgresPool) => new Issue416A01ProtectedLogin(
  pool, new Issue416A01RequestFingerprint(new TrustedClientAddressResolver()),
  new AntiAbuseKeyDeriver(),
);

beforeAll(async () => {
  phc = await hashStaffPassword(RAW);
});
beforeEach(() => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    Buffer.alloc(32, 0x71).toString("base64url");
  delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
});
afterEach(() => {
  if (previousAudience === undefined) delete process.env.VAYLET_AUTH_PROOF_AUDIENCE;
  else process.env.VAYLET_AUTH_PROOF_AUDIENCE = previousAudience;
  if (previousKeyring === undefined) delete process.env.VAYLET_AUTH_PROOF_KEYRING_JSON;
  else process.env.VAYLET_AUTH_PROOF_KEYRING_JSON = previousKeyring;
  if (previousAntiAbuseSecret === undefined) delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = previousAntiAbuseSecret;
  if (previousTrustedProxies === undefined) delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;
  else process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = previousTrustedProxies;
});

function fixture(options: {
  user?: { id: string; password_hash: string | null; status: string };
  lockedUser?: { password_hash: string | null; status: string };
  failBind?: boolean;
} = {}) {
  const queries: string[] = [];
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const lease = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push(sql);
      calls.push({ sql, params });
      if (sql.includes("a01_bind_limiter")) {
        return { rows: [{
          a01_bind_limiter: options.failBind ? USER_ID : params?.[2],
        }], rowCount: 1 };
      }
      if (sql.includes("a01_count_unresolved")) {
        return { rows: [{ a01_count_unresolved: "COUNTED" }], rowCount: 1 };
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
  return { pool, queries, calls, lease };
}

describe("Issue416 A01 isolated purpose-fixed issuer guard", () => {
  it("refuses missing deployment audience before touching the pool", async () => {
    delete process.env.VAYLET_AUTH_PROOF_AUDIENCE;
    const { pool } = fixture();
    await expect(
      makeService(pool).login(email, RAW, limiter(), request),
    ).rejects.toThrow(AntiAbuseUnavailableError);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("requires the pre-domain limiter to bind and COMMIT before real Argon2", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture({ failBind: true });
    await expect(
      makeService(pool).login(email, RAW, limiter(), request),
    ).rejects.toThrow(AntiAbuseUnavailableError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects a reservation for another email or different normalization before touching SQL", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool } = fixture();
    const foreignKey = new AntiAbuseKeyDeriver().derive(
      "v1:staff-login-identifier", "foreign@example.invalid",
    );
    await expect(makeService(pool).login(email, RAW, {
      id: LIMITER_ID, key: foreignKey,
    }, request)).rejects.toThrow(AntiAbuseUnavailableError);
    await expect(makeService(pool).login(email.toUpperCase(), RAW,
      limiter(), request)).rejects.toThrow(AntiAbuseUnavailableError);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects a PHC supplied as the raw password without invoking prepare", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture();
    await expect(
      makeService(pool).login(email, phc, limiter(), request),
    ).rejects.toThrow(StaffAuthenticationError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(false);
  });

  it("does not sign after a locked password-version change", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries } = fixture({
      lockedUser: { password_hash: await hashStaffPassword(RAW), status: "ACTIVE" },
    });
    await expect(
      makeService(pool).login(email, RAW, limiter(), request),
    ).rejects.toThrow(StaffAuthenticationError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(false);
  });

  it("rejects forged SQL frame bytes even after a genuine password", async () => {
    process.env.VAYLET_AUTH_PROOF_AUDIENCE = "a01-local-fixture";
    const { pool, queries, calls } = fixture();
    await expect(
      makeService(pool).login(email, RAW, limiter(), request),
    ).rejects.toThrow(AntiAbuseUnavailableError);
    expect(queries.some((sql) => sql.includes("a01_prepare"))).toBe(true);
    expect(queries.some((sql) => sql.includes("a01_execute"))).toBe(false);
    const bind = calls.find((call) => call.sql.includes("a01_bind_limiter"));
    const prepare = calls.find((call) => call.sql.includes("a01_prepare"));
    expect(bind?.params).toHaveLength(5);
    expect(prepare?.params).toHaveLength(10);
    expect(Buffer.isBuffer(bind?.params?.[3])).toBe(true);
    expect((bind?.params?.[3] as Buffer).length).toBe(32);
    expect(prepare?.params?.[9]).toEqual(bind?.params?.[3]);
  });

  it("is not wired to a public route, nor does it expose a generic signer", () => {
    const source = readFileSync(resolve(
      process.cwd(), "src/modules/auth/vap1/issue416-a01-protected-login.ts",
    ), "utf8");
    const module = readFileSync(resolve(
      process.cwd(), "src/modules/auth/auth.module.ts",
    ), "utf8");
    expect(module).not.toContain("Issue416A01ProtectedLogin");
    for (const caller of ["staff-login.service.ts", "staff-auth.service.ts",
      "native-staff-auth.controller.ts"]) {
      const text = readFileSync(resolve(process.cwd(), "src/modules/auth", caller), "utf8");
      expect(text).not.toContain("Issue416A01ProtectedLogin");
    }
    expect(source).not.toMatch(/export (?:async )?function (?:sign|mac|loadKey)/);
    expect(source).not.toMatch(/\b(?:createHash|createHmac)\([^)]*password/);
  });
});

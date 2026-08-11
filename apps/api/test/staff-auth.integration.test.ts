import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";

import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import argon2 from "argon2";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { AppModule } from "../src/app.module";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  AntiAbuseService,
  AntiAbuseUnavailableError,
} from "../src/modules/anti-abuse/anti-abuse.service";
import {
  Argon2StaffPasswordVerifier,
  StaffAuthService,
} from "../src/modules/auth/staff-auth.service";
import {
  STAFF_PRINCIPAL_RESOLVER,
  type StaffPrincipalResolver,
} from "../src/modules/auth/staff-principal";

interface HttpResult {
  readonly body: Record<string, unknown> | undefined;
  readonly headers: Headers;
  readonly status: number;
}

const allowedOrigin = "https://staff.valet.test";
const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
const testDatabaseName = `valet_004l_auth_${suffix}`;
const runtimeRole = `valet_runtime_004l_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = resolve(process.cwd(), "../..");
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let adminPool: Pool;
let app: INestApplication;
let baseUrl: string;
let databaseCreated = false;
let runtimeRoleCreated = false;
let testMigrationUrl: string;
let testRuntimeUrl: string;

function connectionUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function runtimeUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.username = runtimeRole;
  url.password = runtimePassword;
  return url.toString();
}

function redact(value: string): string {
  return [adminDatabaseUrl, testMigrationUrl, testRuntimeUrl, runtimePassword]
    .filter((secret): secret is string => secret !== undefined && secret !== "")
    .reduce(
      (redacted, secret) => redacted.replaceAll(secret, "[REDACTED]"),
      value,
    );
}

async function runPnpm(
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath === undefined ? pnpmExecutable : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  const childEnvironment = { ...process.env };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete childEnvironment[key];
    else childEnvironment[key] = value;
  }
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repositoryRoot,
      env: childEnvironment,
      shell: npmExecPath === undefined && process.platform === "win32",
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else
        reject(new Error(redact(`pnpm failed (${String(code)}): ${output}`)));
    });
  });
}

async function request(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    origin?: string;
  } = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? allowedOrigin,
    "X-Request-Id": randomUUID(),
  };
  if (options.cookie !== undefined) headers.Cookie = options.cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(options.body ?? {}),
    headers,
    method: "POST",
  });
  const text = await response.text();
  return {
    body:
      text === "" ? undefined : (JSON.parse(text) as Record<string, unknown>),
    headers: response.headers,
    status: response.status,
  };
}

function refreshCookieFrom(result: HttpResult): string {
  const setCookie = result.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie?.split(";", 1)[0] ?? "";
}

function expectClearedRefreshCookie(result: HttpResult): void {
  const setCookie = result.headers.get("set-cookie") ?? "";
  expect(setCookie).toContain("__Secure-vaylet_staff_refresh=");
  expect(setCookie).toContain("Max-Age=0");
  expect(setCookie).toContain("Path=/v1/staff/auth");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Strict");
  expect(setCookie).not.toContain("Domain=");
}

async function createUser(
  options: {
    email?: string;
    password?: string;
    passwordHash?: string;
    status?: "ACTIVE" | "DISABLED";
  } = {},
): Promise<{ email: string; id: string; password: string }> {
  const id = randomUUID();
  const email = options.email ?? `${id}@example.com`;
  const password = options.password ?? "exact staff password";
  const passwordHash =
    options.passwordHash ??
    (await argon2.hash(password, {
      hashLength: 32,
      memoryCost: 65_536,
      parallelism: 4,
      salt: randomBytes(16),
      timeCost: 3,
      type: argon2.argon2id,
      version: 19,
    }));
  await adminPool.query(
    `INSERT INTO users
       (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, $3, $4, transaction_timestamp())`,
    [id, email, passwordHash, options.status ?? "ACTIVE"],
  );
  return { email, id, password };
}

async function createOperationalScope(
  userId: string,
  options: {
    locationAccess?: boolean;
    membershipStatus?: "ACTIVE" | "INACTIVE";
    role?:
      "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_EMPLOYEE" | "VALET_SUPERVISOR";
  } = {},
): Promise<{ locationId: string; organizationId: string }> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const identity = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations
       (id, name, status, timezone, check_in_photos_required, updated_at)
     VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', false, transaction_timestamp())`,
    [organizationId, `VAL-004L ${identity}`],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, updated_at)
     VALUES ($1, $2, 'Auth location', $3, 'Test address', 'Asia/Amman',
             'JOD', 'ACTIVE', transaction_timestamp())`,
    [locationId, organizationId, identity],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
    [
      membershipId,
      organizationId,
      userId,
      options.role ?? "VALET_EMPLOYEE",
      options.membershipStatus ?? "ACTIVE",
    ],
  );
  if (options.locationAccess !== false) {
    await adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [organizationId, membershipId, locationId],
    );
  }
  return { locationId, organizationId };
}

async function loginUser(fixture: {
  email: string;
  password: string;
}): Promise<HttpResult> {
  return request("/v1/staff/auth/login", {
    body: { email: fixture.email, password: fixture.password },
  });
}

async function intakeWithAccess(
  accessToken: string,
  locationId: string,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}/v1/staff/check-in/intakes`, {
    body: JSON.stringify({
      intakeOperationId: `intake:${randomUUID()}`,
      targetLocationId: locationId,
      vehicleIdentity: {
        mode: "TEMPORARY_DESCRIPTOR",
        temporaryDescriptor: `Auth test ${randomUUID()}`,
      },
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Request-Id": randomUUID(),
      ...extraHeaders,
    },
    method: "POST",
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    headers: response.headers,
    status: response.status,
  };
}

async function intakeWithDuplicateAuthorization(
  accessToken: string,
  locationId: string,
): Promise<number> {
  const target = new URL(baseUrl);
  const body = JSON.stringify({
    intakeOperationId: `intake:${randomUUID()}`,
    targetLocationId: locationId,
    vehicleIdentity: {
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: `Duplicate header ${randomUUID()}`,
    },
  });
  return new Promise<number>((resolvePromise, reject) => {
    const request = httpRequest(
      {
        headers: [
          "Authorization",
          `Bearer ${accessToken}`,
          "Authorization",
          `Bearer ${accessToken}`,
          "Content-Type",
          "application/json",
          "Content-Length",
          String(Buffer.byteLength(body)),
          "Host",
          target.host,
        ],
        host: target.hostname,
        method: "POST",
        path: "/v1/staff/check-in/intakes",
        port: target.port,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolvePromise(response.statusCode ?? 0));
      },
    );
    request.on("error", reject);
    request.end(body);
  });
}

beforeAll(async () => {
  const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
  try {
    await bootstrap.query(`CREATE DATABASE "${testDatabaseName}"`);
    databaseCreated = true;
  } finally {
    await bootstrap.end();
  }
  testMigrationUrl = connectionUrlFor(testDatabaseName);
  testRuntimeUrl = runtimeUrlFor(testDatabaseName);
  await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  });
  runtimeRoleCreated = true;
  await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
    DATABASE_URL: testRuntimeUrl,
    MIGRATION_DATABASE_URL: testMigrationUrl,
    NODE_ENV: "test",
  });
  adminPool = new Pool({ connectionString: testMigrationUrl });
  process.env.DATABASE_URL = testRuntimeUrl;
  process.env.STAFF_AUTH_ALLOWED_ORIGINS = allowedOrigin;
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
  process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS = "";
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 120_000);

beforeEach(async () => {
  await adminPool.query("DELETE FROM anti_abuse_events");
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (adminPool !== undefined) await adminPool.end();
  const bootstrap = new Pool({ connectionString: adminDatabaseUrl });
  try {
    if (databaseCreated) {
      await bootstrap.query(`DROP DATABASE "${testDatabaseName}" WITH (FORCE)`);
    }
    if (runtimeRoleCreated) {
      await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
    }
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("production staff authentication", () => {
  it("logs in with exact password semantics and stores only versioned hashes", async () => {
    const fixture = await createUser({ password: "  exact password  " });
    const failedTrimmed = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password.trim() },
    });
    expect(failedTrimmed.status).toBe(401);
    expect(failedTrimmed.body?.code).toBe("STAFF_AUTHENTICATION_FAILED");
    const failedLastLogin = await adminPool.query<{
      last_login_at: Date | null;
    }>(`SELECT last_login_at FROM users WHERE id = $1`, [fixture.id]);
    expect(failedLastLogin.rows[0]?.last_login_at).toBeNull();

    const result = await request("/v1/staff/auth/login", {
      body: {
        email: `  ${fixture.email.toUpperCase()} `,
        password: fixture.password,
      },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ tokenType: "Bearer" });
    expect(result.body?.accessToken).toMatch(/^vsa1\.[A-Za-z0-9_-]{43}$/);
    expect(result.body).not.toHaveProperty("refreshToken");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("pragma")).toBe("no-cache");
    const setCookie = result.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toContain("Path=/v1/staff/auth");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain("Domain=");

    const persisted = await adminPool.query<{
      access_expires_at: Date;
      absolute_expires_at: Date;
      current_access_token_hash: string;
      token_hash: string;
    }>(
      `SELECT session.current_access_token_hash, session.access_expires_at,
              session.absolute_expires_at, refresh.token_hash
       FROM staff_auth_sessions AS session
       INNER JOIN staff_refresh_credentials AS refresh ON refresh.session_id = session.id
       WHERE session.user_id = $1`,
      [fixture.id],
    );
    const row = persisted.rows[0];
    expect(row?.current_access_token_hash).toMatch(
      /^staff-access-sha256:v1:[0-9a-f]{64}$/,
    );
    expect(row?.token_hash).toMatch(/^staff-refresh-sha256:v1:[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(String(result.body?.accessToken));
    expect(JSON.stringify(row)).not.toContain(refreshCookieFrom(result));
    expect(
      (row?.access_expires_at.getTime() ?? 0) -
        new Date(String(result.body?.accessExpiresAt)).getTime(),
    ).toBe(0);
    expect(
      (row?.absolute_expires_at.getTime() ?? 0) -
        new Date(String(result.body?.sessionExpiresAt)).getTime(),
    ).toBe(0);
    const lastLogin = await adminPool.query<{ last_login_at: Date | null }>(
      `SELECT last_login_at FROM users WHERE id = $1`,
      [fixture.id],
    );
    expect(lastLogin.rows[0]?.last_login_at).not.toBeNull();
  });

  it("uses one generic failure for unknown, malformed-hash and disabled users", async () => {
    const malformed = await createUser({ passwordHash: "placeholder-hash" });
    const disabled = await createUser({ status: "DISABLED" });
    for (const credentials of [
      { email: `${randomUUID()}@example.com`, password: "not known" },
      { email: malformed.email, password: malformed.password },
      { email: disabled.email, password: disabled.password },
    ]) {
      const result = await request("/v1/staff/auth/login", {
        body: credentials,
      });
      expect(result.status).toBe(401);
      expect(result.body).toMatchObject({
        code: "STAFF_AUTHENTICATION_FAILED",
        message: "Staff authentication failed.",
      });
    }
    const sessions = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM staff_auth_sessions
       WHERE user_id = ANY($1::uuid[])`,
      [[malformed.id, disabled.id]],
    );
    expect(sessions.rows[0]?.count).toBe("0");
    const lastLogin = await adminPool.query<{
      id: string;
      last_login_at: Date | null;
    }>(
      `SELECT id, last_login_at FROM users WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[malformed.id, disabled.id]],
    );
    expect(lastLogin.rows.every((row) => row.last_login_at === null)).toBe(
      true,
    );
    const limiter = await adminPool.query<{
      address_failures: string;
      identifier_failures: string;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE scope = 'v1:staff-client-address' AND state = 'COUNTED'
         )::text AS address_failures,
         count(*) FILTER (
           WHERE scope = 'v1:staff-login-identifier' AND state = 'COUNTED'
         )::text AS identifier_failures
       FROM anti_abuse_events`,
    );
    expect(limiter.rows[0]).toEqual({
      address_failures: "3",
      identifier_failures: "3",
    });
  });

  it("rejects missing, malformed, random, expired and revoked access identically", async () => {
    const resolver = app.get<StaffPrincipalResolver>(STAFF_PRINCIPAL_RESOLVER);
    for (const authorization of [
      undefined,
      "bearer malformed",
      `Bearer vsa1.${"a".repeat(43)}`,
      `Bearer ${"g".repeat(43)}`,
    ]) {
      await expect(resolver.resolve(authorization)).rejects.toMatchObject({
        status: 401,
      });
    }

    const expiredUser = await createUser();
    const expiredLogin = await loginUser(expiredUser);
    await adminPool.query(
      `UPDATE staff_auth_sessions
       SET access_expires_at = created_at + INTERVAL '1 millisecond'
       WHERE user_id = $1`,
      [expiredUser.id],
    );
    await expect(
      resolver.resolve(`Bearer ${String(expiredLogin.body?.accessToken)}`),
    ).rejects.toMatchObject({ status: 401 });

    const revokedUser = await createUser();
    const revokedLogin = await loginUser(revokedUser);
    await adminPool.query(
      `UPDATE staff_auth_sessions SET revoked_at = transaction_timestamp()
       WHERE user_id = $1`,
      [revokedUser.id],
    );
    await expect(
      resolver.resolve(`Bearer ${String(revokedLogin.body?.accessToken)}`),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects authority fields and unapproved or absent origins", async () => {
    const fixture = await createUser();
    const authority = await request("/v1/staff/auth/login", {
      body: {
        email: fixture.email,
        organizationId: randomUUID(),
        password: fixture.password,
      },
    });
    expect(authority.status).toBe(400);
    const wrongOrigin = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
      origin: "https://attacker.example",
    });
    expect(wrongOrigin.status).toBe(403);
    expect(wrongOrigin.body?.code).toBe("STAFF_AUTH_ORIGIN_NOT_ALLOWED");
    expect(wrongOrigin.headers.get("set-cookie")).toBeNull();
    const malformedJson = await fetch(`${baseUrl}/v1/staff/auth/login`, {
      body: "{",
      headers: { "Content-Type": "application/json", Origin: allowedOrigin },
      method: "POST",
    });
    expect(malformedJson.status).toBe(400);
    const limiterRows = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM anti_abuse_events`,
    );
    expect(limiterRows.rows[0]?.count).toBe("0");
  });

  it("clears malformed and unknown refresh credentials on generic authentication failure", async () => {
    for (const cookie of [
      "__Secure-vaylet_staff_refresh=malformed",
      `__Secure-vaylet_staff_refresh=vsr1.${"a".repeat(43)}`,
    ]) {
      const result = await request("/v1/staff/auth/refresh", { cookie });
      expect(result.status).toBe(401);
      expect(result.body?.code).toBe("STAFF_AUTHENTICATION_FAILED");
      expectClearedRefreshCookie(result);
    }
  });

  it("does not clear or consume refresh credentials for transport or Origin failures", async () => {
    const fixture = await createUser();
    const login = await loginUser(fixture);
    const cookie = refreshCookieFrom(login);
    const invalidBody = await request("/v1/staff/auth/refresh", {
      body: { userId: fixture.id },
      cookie,
    });
    expect(invalidBody.status).toBe(400);
    expect(invalidBody.headers.get("set-cookie")).toBeNull();
    const invalidOrigin = await request("/v1/staff/auth/refresh", {
      cookie,
      origin: "https://attacker.example",
    });
    expect(invalidOrigin.status).toBe(403);
    expect(invalidOrigin.headers.get("set-cookie")).toBeNull();
    expect(await request("/v1/staff/auth/refresh", { cookie })).toMatchObject({
      status: 200,
    });
  });

  it("rotates both credentials, preserves absolute expiry and revokes replayed families", async () => {
    const fixture = await createUser();
    const login = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });
    const firstAccess = String(login.body?.accessToken);
    const firstCookie = refreshCookieFrom(login);
    const refreshed = await request("/v1/staff/auth/refresh", {
      cookie: firstCookie,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body?.accessToken).not.toBe(firstAccess);
    expect(refreshed.body?.sessionExpiresAt).toBe(login.body?.sessionExpiresAt);
    const refreshSetCookie = refreshed.headers.get("set-cookie") ?? "";
    expect(refreshSetCookie).toMatch(/Max-Age=2591\d{3}/);
    expect(refreshCookieFrom(refreshed)).not.toBe(firstCookie);

    const resolver = app.get<StaffPrincipalResolver>(STAFF_PRINCIPAL_RESOLVER);
    await expect(
      resolver.resolve(`Bearer ${firstAccess}`),
    ).rejects.toBeDefined();
    await expect(
      resolver.resolve(`Bearer ${String(refreshed.body?.accessToken)}`),
    ).resolves.toEqual({ userId: fixture.id });

    const replay = await request("/v1/staff/auth/refresh", {
      cookie: firstCookie,
    });
    expect(replay.status).toBe(401);
    expectClearedRefreshCookie(replay);
    await expect(
      resolver.resolve(`Bearer ${String(refreshed.body?.accessToken)}`),
    ).rejects.toBeDefined();
    const state = await adminPool.query<{
      current_count: string;
      revoked_at: Date | null;
    }>(
      `SELECT session.revoked_at,
              count(*) FILTER (WHERE refresh.consumed_at IS NULL)::text AS current_count
       FROM staff_auth_sessions AS session
       INNER JOIN staff_refresh_credentials AS refresh ON refresh.session_id = session.id
       WHERE session.user_id = $1
       GROUP BY session.id`,
      [fixture.id],
    );
    expect(state.rows[0]?.revoked_at).not.toBeNull();
    expect(state.rows[0]?.current_count).toBe("1");
    const usable = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM staff_refresh_credentials AS refresh
       INNER JOIN staff_auth_sessions AS session ON session.id = refresh.session_id
       WHERE session.user_id = $1
         AND refresh.consumed_at IS NULL
         AND session.revoked_at IS NULL`,
      [fixture.id],
    );
    expect(usable.rows[0]?.count).toBe("0");
  });

  it("bounds rotated access and cookie lifetime to the original absolute expiry", async () => {
    const fixture = await createUser();
    const login = await loginUser(fixture);
    await adminPool.query(
      `UPDATE staff_auth_sessions
       SET absolute_expires_at = transaction_timestamp() + INTERVAL '5 minutes',
           access_expires_at = transaction_timestamp() + INTERVAL '5 minutes'
       WHERE user_id = $1`,
      [fixture.id],
    );
    const refreshed = await request("/v1/staff/auth/refresh", {
      cookie: refreshCookieFrom(login),
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body?.accessExpiresAt).toBe(
      refreshed.body?.sessionExpiresAt,
    );
    const maxAge = /Max-Age=(\d+)/.exec(
      refreshed.headers.get("set-cookie") ?? "",
    )?.[1];
    expect(Number(maxAge)).toBeGreaterThan(0);
    expect(Number(maxAge)).toBeLessThanOrEqual(300);
  });

  it("uses an exact 2,592,000-second lifetime in a DST-observing database timezone", async () => {
    const fixture = await createUser();
    const dstPool = new Pool({
      connectionString: testRuntimeUrl,
      options: "-c timezone=America/New_York",
    });
    try {
      const service = new StaffAuthService(
        dstPool,
        new Argon2StaffPasswordVerifier(),
      );
      await service.login(fixture.email, fixture.password);
      const persisted = await dstPool.query<{
        refresh_matches_session: boolean;
        session_seconds: number;
      }>(
        `SELECT
           EXTRACT(EPOCH FROM (session.absolute_expires_at - session.created_at))::integer AS session_seconds,
           refresh.expires_at = session.absolute_expires_at AS refresh_matches_session
         FROM staff_auth_sessions AS session
         INNER JOIN staff_refresh_credentials AS refresh ON refresh.session_id = session.id
         WHERE session.user_id = $1`,
        [fixture.id],
      );
      expect(persisted.rows[0]).toEqual({
        refresh_matches_session: true,
        session_seconds: 2_592_000,
      });
      const dstTransition = await dstPool.query<{ elapsed_seconds: number }>(
        `SELECT EXTRACT(EPOCH FROM (
           TIMESTAMPTZ '2026-10-15 12:00:00 America/New_York' + INTERVAL '720 hours'
           - TIMESTAMPTZ '2026-10-15 12:00:00 America/New_York'
         ))::integer AS elapsed_seconds`,
      );
      expect(dstTransition.rows[0]?.elapsed_seconds).toBe(2_592_000);
    } finally {
      await dstPool.end();
    }
  });

  it("allows one concurrent refresh winner and revokes the family on losing reuse", async () => {
    const fixture = await createUser();
    const login = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });
    const cookie = refreshCookieFrom(login);
    const results = await Promise.all([
      request("/v1/staff/auth/refresh", { cookie }),
      request("/v1/staff/auth/refresh", { cookie }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    const session = await adminPool.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM staff_auth_sessions WHERE user_id = $1`,
      [fixture.id],
    );
    expect(session.rows[0]?.revoked_at).not.toBeNull();
  });

  it("invalidates access and refresh immediately after user disable", async () => {
    const fixture = await createUser();
    const login = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });
    await adminPool.query(
      `UPDATE users SET status = 'DISABLED', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.id],
    );
    const resolver = app.get<StaffPrincipalResolver>(STAFF_PRINCIPAL_RESOLVER);
    await expect(
      resolver.resolve(`Bearer ${String(login.body?.accessToken)}`),
    ).rejects.toBeDefined();
    const refresh = await request("/v1/staff/auth/refresh", {
      cookie: refreshCookieFrom(login),
    });
    expect(refresh.status).toBe(401);
    expectClearedRefreshCookie(refresh);
  });

  it("clears an expired session refresh credential on generic failure", async () => {
    const fixture = await createUser();
    const login = await loginUser(fixture);
    await adminPool.query(
      `UPDATE staff_auth_sessions
       SET absolute_expires_at = created_at + INTERVAL '1 millisecond',
           access_expires_at = created_at + INTERVAL '1 millisecond'
       WHERE user_id = $1`,
      [fixture.id],
    );
    const result = await request("/v1/staff/auth/refresh", {
      cookie: refreshCookieFrom(login),
    });
    expect(result.status).toBe(401);
    expect(result.body?.code).toBe("STAFF_AUTHENTICATION_FAILED");
    expectClearedRefreshCookie(result);
  });

  it("logs out idempotently, revokes valid sessions and clears the cookie", async () => {
    const fixture = await createUser();
    const login = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });
    const cookie = refreshCookieFrom(login);
    const logout = await request("/v1/staff/auth/logout", { cookie });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    const repeated = await request("/v1/staff/auth/logout", { cookie });
    expect(repeated.status).toBe(204);
    const refresh = await request("/v1/staff/auth/refresh", { cookie });
    expect(refresh.status).toBe(401);
    const resolver = app.get<StaffPrincipalResolver>(STAFF_PRINCIPAL_RESOLVER);
    await expect(
      resolver.resolve(`Bearer ${String(login.body?.accessToken)}`),
    ).rejects.toBeDefined();
  });

  it("preserves field-role, membership, location and tenant authorization after authentication", async () => {
    for (const expectation of [
      { role: "VALET_EMPLOYEE" as const, status: 201 },
      { role: "VALET_SUPERVISOR" as const, status: 201 },
      { role: "LOCATION_MANAGER" as const, status: 404 },
      { role: "ORG_ADMIN" as const, status: 404 },
    ]) {
      const fixture = await createUser();
      const scope = await createOperationalScope(fixture.id, {
        role: expectation.role,
      });
      const login = await loginUser(fixture);
      const result = await intakeWithAccess(
        String(login.body?.accessToken),
        scope.locationId,
        expectation.role === "VALET_EMPLOYEE"
          ? {
              "X-Staff-User-Id": randomUUID(),
              "X-User-Id": randomUUID(),
            }
          : {},
      );
      expect(result.status).toBe(expectation.status);
      if (expectation.status === 404) {
        expect(result.body?.code).toBe("AUTHORIZATION_DENIED");
      }
    }

    const inactive = await createUser();
    const inactiveScope = await createOperationalScope(inactive.id, {
      membershipStatus: "INACTIVE",
    });
    const inactiveLogin = await loginUser(inactive);
    const inactiveResult = await intakeWithAccess(
      String(inactiveLogin.body?.accessToken),
      inactiveScope.locationId,
    );
    expect(inactiveResult).toMatchObject({
      body: { code: "TENANT_ACCESS_DENIED" },
      status: 404,
    });

    const noAccess = await createUser();
    const noAccessScope = await createOperationalScope(noAccess.id, {
      locationAccess: false,
    });
    const noAccessLogin = await loginUser(noAccess);
    const noAccessResult = await intakeWithAccess(
      String(noAccessLogin.body?.accessToken),
      noAccessScope.locationId,
    );
    expect(noAccessResult).toMatchObject({
      body: { code: "LOCATION_ACCESS_DENIED" },
      status: 404,
    });

    const crossTenant = await createUser();
    await createOperationalScope(crossTenant.id);
    const foreignUser = await createUser();
    const foreignScope = await createOperationalScope(foreignUser.id);
    const crossTenantLogin = await loginUser(crossTenant);
    const crossTenantResult = await intakeWithAccess(
      String(crossTenantLogin.body?.accessToken),
      foreignScope.locationId,
    );
    expect(crossTenantResult).toMatchObject({
      body: { code: "TENANT_ACCESS_DENIED" },
      status: 404,
    });
    expect(JSON.stringify(crossTenantResult.body)).not.toContain(
      foreignScope.organizationId,
    );
  });

  it("keeps staff access, refresh and guest bearer formats isolated", async () => {
    const fixture = await createUser();
    const login = await loginUser(fixture);
    const staffAccess = String(login.body?.accessToken);
    const guestWithStaffAccess = await fetch(`${baseUrl}/v1/guest/session`, {
      headers: { Authorization: `Bearer ${staffAccess}` },
    });
    expect(guestWithStaffAccess.status).toBe(401);
    const refreshValue = refreshCookieFrom(login).split("=", 2)[1] ?? "";
    const guestWithStaffRefresh = await fetch(`${baseUrl}/v1/guest/session`, {
      headers: { Authorization: `Bearer ${refreshValue}` },
    });
    expect(guestWithStaffRefresh.status).toBe(401);

    const resolver = app.get<StaffPrincipalResolver>(STAFF_PRINCIPAL_RESOLVER);
    await expect(
      resolver.resolve(`Bearer ${"g".repeat(43)}`),
    ).rejects.toBeDefined();
    await expect(
      resolver.resolve(`Bearer ${refreshValue}`),
    ).rejects.toBeDefined();
  });

  it("rejects duplicate raw Authorization header fields before authentication", async () => {
    const fixture = await createUser();
    const scope = await createOperationalScope(fixture.id);
    const login = await loginUser(fixture);
    await expect(
      intakeWithDuplicateAuthorization(
        String(login.body?.accessToken),
        scope.locationId,
      ),
    ).resolves.toBe(401);
    const sessions = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM valet_sessions
       WHERE organization_id = $1`,
      [scope.organizationId],
    );
    expect(sessions.rows[0]?.count).toBe("0");
  });

  it("enforces five normalized-identifier failures without verifying the blocked password", async () => {
    const fixture = await createUser();
    for (const email of [
      fixture.email.toUpperCase(),
      fixture.email,
      fixture.email.toUpperCase(),
      fixture.email,
      fixture.email,
    ]) {
      const failed = await request("/v1/staff/auth/login", {
        body: { email, password: "wrong password" },
      });
      expect(failed.status).toBe(401);
    }
    const blocked = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      code: "STAFF_AUTHENTICATION_RATE_LIMITED",
      message: "Too many requests. Try again later.",
    });
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(
      1,
    );
    expect(Number(blocked.headers.get("retry-after"))).toBeLessThanOrEqual(900);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
  }, 30_000);

  it("counts all allowed address attempts, including success, and blocks attempt 31", async () => {
    const successful = await createUser();
    expect((await loginUser(successful)).status).toBe(200);
    for (let index = 1; index < 30; index += 1) {
      const failed = await request("/v1/staff/auth/login", {
        body: {
          email: `unknown-${index}-${randomUUID()}@example.com`,
          password: "wrong password",
        },
      });
      expect(failed.status).toBe(401);
    }
    const blocked = await request("/v1/staff/auth/login", {
      body: {
        email: `${randomUUID()}@example.com`,
        password: "wrong password",
      },
    });
    expect(blocked.status).toBe(429);
    const rows = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM anti_abuse_events
       WHERE scope = 'v1:staff-client-address' AND state = 'COUNTED'`,
    );
    expect(rows.rows[0]?.count).toBe("30");
  }, 60_000);

  it("returns the longer address blocker when attempt 30 encounters an exhausted identifier", async () => {
    const fixture = await createUser();
    const limiter = app.get(AntiAbuseService);
    const addressKey = limiter.key("v1:staff-client-address", "127.0.0.1");
    const identifierKey = limiter.key(
      "v1:staff-login-identifier",
      fixture.email,
    );
    await adminPool.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, state, occurred_at)
       SELECT $1, $2, 'COUNTED', clock_timestamp() - INTERVAL '1 minute'
       FROM generate_series(1, 29)
       UNION ALL
       SELECT $3, $4, 'COUNTED', clock_timestamp() - INTERVAL '14 minutes 50 seconds'
       FROM generate_series(1, 5)`,
      [
        addressKey.scope,
        addressKey.keyHash,
        identifierKey.scope,
        identifierKey.keyHash,
      ],
    );
    const verifier = app.get(Argon2StaffPasswordVerifier);
    const verify = vi.spyOn(verifier, "verify");
    const verificationCount = verify.mock.calls.length;

    const blocked = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(800);
    expect(verify).toHaveBeenCalledTimes(verificationCount);
    const persisted = await adminPool.query<{
      address_count: string;
      identifier_count: string;
      session_count: string;
    }>(
      `SELECT
         count(*) FILTER (
           WHERE scope = 'v1:staff-client-address' AND state = 'COUNTED'
         )::text AS address_count,
         count(*) FILTER (
           WHERE scope = 'v1:staff-login-identifier' AND state = 'COUNTED'
         )::text AS identifier_count,
         (SELECT count(*)::text FROM staff_auth_sessions WHERE user_id = $1)
           AS session_count
       FROM anti_abuse_events`,
      [fixture.id],
    );
    expect(persisted.rows[0]).toEqual({
      address_count: "30",
      identifier_count: "5",
      session_count: "0",
    });
    verify.mockRestore();
  });

  it("returns the longer identifier blocker when the address scope is already exhausted", async () => {
    const fixture = await createUser();
    const limiter = app.get(AntiAbuseService);
    const addressKey = limiter.key("v1:staff-client-address", "127.0.0.1");
    const identifierKey = limiter.key(
      "v1:staff-login-identifier",
      fixture.email,
    );
    await adminPool.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, state, occurred_at)
       SELECT $1, $2, 'COUNTED', clock_timestamp() - INTERVAL '14 minutes 50 seconds'
       FROM generate_series(1, 30)
       UNION ALL
       SELECT $3, $4, 'COUNTED', clock_timestamp() - INTERVAL '1 minute'
       FROM generate_series(1, 5)`,
      [
        addressKey.scope,
        addressKey.keyHash,
        identifierKey.scope,
        identifierKey.keyHash,
      ],
    );
    const verifier = app.get(Argon2StaffPasswordVerifier);
    const verify = vi.spyOn(verifier, "verify");
    const verificationCount = verify.mock.calls.length;

    const blocked = await request("/v1/staff/auth/login", {
      body: { email: fixture.email, password: fixture.password },
    });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(800);
    expect(verify).toHaveBeenCalledTimes(verificationCount);
    const events = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM anti_abuse_events`,
    );
    expect(events.rows[0]?.count).toBe("35");
    verify.mockRestore();
  });

  it("ignores successful identifier reservations without erasing earlier failures", async () => {
    const fixture = await createUser();
    expect(
      await request("/v1/staff/auth/login", {
        body: { email: fixture.email, password: "wrong password" },
      }),
    ).toMatchObject({ status: 401 });
    for (let index = 0; index < 6; index += 1) {
      expect(await loginUser(fixture)).toMatchObject({ status: 200 });
    }
    const states = await adminPool.query<{ state: string }>(
      `SELECT state FROM anti_abuse_events
       WHERE scope = 'v1:staff-login-identifier'
       ORDER BY occurred_at, id`,
    );
    expect(states.rows.filter((row) => row.state === "COUNTED")).toHaveLength(
      1,
    );
    expect(states.rows.filter((row) => row.state === "IGNORED")).toHaveLength(
      6,
    );
  }, 30_000);

  it("serializes concurrent identifier failures at exactly five reservations", async () => {
    const email = `${randomUUID()}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request("/v1/staff/auth/login", {
          body: { email, password: "wrong password" },
        }),
      ),
    );
    expect(results.filter((result) => result.status === 401)).toHaveLength(5);
    expect(results.filter((result) => result.status === 429)).toHaveLength(3);
    const counted = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM anti_abuse_events
       WHERE scope = 'v1:staff-login-identifier'
         AND state IN ('PENDING', 'COUNTED')`,
    );
    expect(counted.rows[0]?.count).toBe("5");
  }, 30_000);

  it("returns 503 when failure finalization cannot become authoritative", async () => {
    await adminPool.query(
      `CREATE FUNCTION test_block_counted_anti_abuse() RETURNS trigger
       LANGUAGE plpgsql AS $$ BEGIN
         IF NEW.state = 'COUNTED' THEN RAISE EXCEPTION 'blocked'; END IF;
         RETURN NEW;
       END $$;
       CREATE TRIGGER test_block_counted_anti_abuse
       BEFORE UPDATE ON anti_abuse_events
       FOR EACH ROW EXECUTE FUNCTION test_block_counted_anti_abuse()`,
    );
    try {
      const result = await request("/v1/staff/auth/login", {
        body: { email: `${randomUUID()}@example.com`, password: "wrong" },
      });
      expect(result.status).toBe(503);
      expect(result.body?.code).toBe("ANTI_ABUSE_UNAVAILABLE");
      expect(result.headers.get("cache-control")).toBe("no-store");
    } finally {
      await adminPool.query(
        `DROP TRIGGER test_block_counted_anti_abuse ON anti_abuse_events`,
      );
      await adminPool.query(`DROP FUNCTION test_block_counted_anti_abuse()`);
    }
  });

  it("rolls back successful login state when identifier success-finalization fails", async () => {
    const fixture = await createUser();
    await adminPool.query(
      `CREATE FUNCTION test_block_ignored_anti_abuse() RETURNS trigger
       LANGUAGE plpgsql AS $$ BEGIN
         IF NEW.state = 'IGNORED' THEN RAISE EXCEPTION 'blocked'; END IF;
         RETURN NEW;
       END $$;
       CREATE TRIGGER test_block_ignored_anti_abuse
       BEFORE UPDATE ON anti_abuse_events
       FOR EACH ROW EXECUTE FUNCTION test_block_ignored_anti_abuse()`,
    );
    try {
      const result = await loginUser(fixture);
      expect(result.status).toBe(503);
      const persisted = await adminPool.query<{
        last_login_at: Date | null;
        session_count: string;
      }>(
        `SELECT staff_user.last_login_at,
                count(session.id)::text AS session_count
         FROM users AS staff_user
         LEFT JOIN staff_auth_sessions AS session ON session.user_id = staff_user.id
         WHERE staff_user.id = $1
         GROUP BY staff_user.id`,
        [fixture.id],
      );
      expect(persisted.rows[0]).toEqual({
        last_login_at: null,
        session_count: "0",
      });
    } finally {
      await adminPool.query(
        `DROP TRIGGER test_block_ignored_anti_abuse ON anti_abuse_events`,
      );
      await adminPool.query(`DROP FUNCTION test_block_ignored_anti_abuse()`);
    }
  });

  it("shares exact rolling state across service instances and uses full hashes despite lock collision", async () => {
    const first = app.get(AntiAbuseService);
    const secondPool = new Pool({ connectionString: testRuntimeUrl });
    const second = new AntiAbuseService(secondPool, new AntiAbuseKeyDeriver());
    try {
      const key = first.key("v1:staff-client-address", "192.0.2.10");
      const decisions = await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          (index % 2 === 0 ? first : second).count(key, 30),
        ),
      );
      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(30);
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(
        10,
      );

      const collisionA = {
        ...first.key("v1:guest-token", "collision-a"),
        lockHigh: 123,
        lockLow: 456,
      };
      const collisionB = {
        ...first.key("v1:guest-token", "collision-b"),
        lockHigh: 123,
        lockLow: 456,
      };
      expect(await first.count(collisionA, 1)).toEqual({ allowed: true });
      expect(await second.count(collisionB, 1)).toEqual({ allowed: true });
    } finally {
      await secondPool.end();
    }
  });

  it("uses database time for rolling expiry and fails closed after the bounded advisory wait", async () => {
    const limiter = app.get(AntiAbuseService);
    const key = limiter.key("v1:guest-token", "database-time-test");
    expect(await limiter.count(key, 1)).toEqual({ allowed: true });
    const blocked = await limiter.count(key, 1);
    expect(blocked.allowed).toBe(false);
    await adminPool.query(
      `UPDATE anti_abuse_events
       SET occurred_at = clock_timestamp() - INTERVAL '15 minutes 1 second'
       WHERE scope = $1 AND key_hash = $2`,
      [key.scope, key.keyHash],
    );
    expect(await limiter.count(key, 1)).toEqual({ allowed: true });

    const lockClient = await adminPool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT pg_advisory_xact_lock($1, $2)", [
        key.lockHigh,
        key.lockLow,
      ]);
      await expect(limiter.count(key, 2)).rejects.toBeInstanceOf(
        AntiAbuseUnavailableError,
      );
    } finally {
      await lockClient.query("ROLLBACK");
      lockClient.release();
    }
  }, 10_000);

  it("uses one database decision instant when the oldest blocker expires between count and retry", async () => {
    const delayedPool = new Pool({ connectionString: testRuntimeUrl });
    const originalConnect = delayedPool.connect.bind(delayedPool);
    delayedPool.connect = (async () => {
      const client = await originalConnect();
      const originalQuery = client.query.bind(client) as (
        text: string,
        values?: unknown[],
      ) => Promise<unknown>;
      let delayed = false;
      client.query = (async (text: string, values?: unknown[]) => {
        const result = await originalQuery(text, values);
        if (!delayed && text.includes("count(*)::integer AS count")) {
          delayed = true;
          await originalQuery("SELECT pg_sleep(1)");
        }
        return result;
      }) as typeof client.query;
      return client;
    }) as typeof delayedPool.connect;
    const limiter = new AntiAbuseService(
      delayedPool,
      new AntiAbuseKeyDeriver(),
    );
    const key = limiter.key("v1:guest-token", "decision-boundary-test");
    await adminPool.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, state, occurred_at)
       VALUES
         ($1, $2, 'COUNTED', clock_timestamp() - INTERVAL '14 minutes 59.5 seconds'),
         ($1, $2, 'COUNTED', clock_timestamp())`,
      [key.scope, key.keyHash],
    );
    try {
      await expect(limiter.blocker(key, 2)).resolves.toBe(1);
    } finally {
      await delayedPool.end();
    }
  });

  it("fails the protected login closed when the HMAC secret is unavailable", async () => {
    const secret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
    try {
      const result = await request("/v1/staff/auth/login", {
        body: {
          email: `${randomUUID()}@example.com`,
          password: "not verified",
        },
      });
      expect(result.status).toBe(503);
      expect(result.body).toMatchObject({
        code: "ANTI_ABUSE_UNAVAILABLE",
        message: "Service temporarily unavailable.",
      });
      expect(
        await adminPool.query(`SELECT 1 FROM anti_abuse_events`),
      ).toMatchObject({
        rowCount: 0,
      });
    } finally {
      if (secret === undefined)
        delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
      else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = secret;
    }
  });
});

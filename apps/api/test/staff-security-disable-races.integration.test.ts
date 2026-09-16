import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { executeControlledSecurityDisable } from "../tools/security-disable/execution";
import type { SecurityDisableArguments } from "../tools/security-disable/types";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function environment(): NodeJS.ProcessEnv {
  return { MIGRATION_DATABASE_URL: fixture.migrationDatabaseUrl(), NODE_ENV: "test" };
}

function command(
  userId: string,
  overrides: Partial<SecurityDisableArguments> = {},
): SecurityDisableArguments {
  return {
    operation: "disable-user",
    operationId: randomUUID(),
    operatorRef: "SECURITY-RACE-42",
    userId,
    ...overrides,
  };
}

async function holdUserSecurityLock(userId: string): Promise<Client> {
  const client = new Client({ connectionString: fixture.migrationDatabaseUrl() });
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-user-security:' || $1::text, 0)
     )`,
    [userId],
  );
  return client;
}

async function waitForAdvisoryWaiters(expected: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM pg_locks
       WHERE locktype='advisory' AND NOT granted
         AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
    );
    if (Number(result.rows[0]?.count ?? 0) >= expected) return;
  }
  throw new Error(`Timed out waiting for ${expected} advisory lock waiters.`);
}

async function releaseBarrier(client: Client): Promise<void> {
  try {
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

function pushBody() {
  return {
    appBuild: "100",
    appIdentifier: "com.vaylet.employee",
    appVersion: "1.0.0",
    installationId: randomUUID(),
    locale: "en",
    platform: "ANDROID",
    provider: "FCM",
    providerToken: `security-disable-race-${randomUUID()}`,
  };
}

describe("MGT-BE-04 controlled security-disable serialization", () => {
  it("converges concurrent exact retries and rejects a changed subject for the same operation id", async () => {
    const first = await fixture.createUser();
    const second = await fixture.createUser();
    const disable = command(first.id);
    const results = await Promise.all([
      executeControlledSecurityDisable(disable, environment()),
      executeControlledSecurityDisable(disable, environment()),
    ]);
    expect(results).toEqual([
      { operationId: disable.operationId, userId: first.id },
      { operationId: disable.operationId, userId: first.id },
    ]);
    await expect(
      executeControlledSecurityDisable(
        { ...disable, userId: second.id },
        environment(),
      ),
    ).rejects.toThrow("operation identity conflict");
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM account_security_audit_events WHERE id=$1`,
      [disable.operationId],
    );
    expect(audit.rows[0]?.count).toBe("1");
  }, 30_000);

  it("makes security-disable final against a queued login", async () => {
    const user = await fixture.createUser();
    const barrier = await holdUserSecurityLock(user.id);
    try {
      const disable = executeControlledSecurityDisable(command(user.id), environment());
      await waitForAdvisoryWaiters(1);
      const login = fixture.request("/v1/staff/auth/native/login", {
        body: { email: user.email, password: user.password },
      });
      await waitForAdvisoryWaiters(2);
      await releaseBarrier(barrier);
      await expect(disable).resolves.toMatchObject({ userId: user.id });
      expect((await login).status).toBe(401);
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
    const sessions = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM staff_auth_sessions
       WHERE user_id=$1 AND revoked_at IS NULL`,
      [user.id],
    );
    expect(sessions.rows[0]?.count).toBe("0");
  }, 30_000);

  it("makes security-disable final against a queued refresh", async () => {
    const user = await fixture.createUser();
    const auth = await fixture.nativeLogin(user);
    const barrier = await holdUserSecurityLock(user.id);
    try {
      const disable = executeControlledSecurityDisable(command(user.id), environment());
      await waitForAdvisoryWaiters(1);
      const refresh = fixture.refresh(auth.refreshToken);
      await waitForAdvisoryWaiters(2);
      await releaseBarrier(barrier);
      await expect(disable).resolves.toMatchObject({ userId: user.id });
      expect((await refresh).status).toBe(401);
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
    expect((await fixture.sessionSnapshot(auth.sessionId)).rows[0]?.revoked_at).toBeInstanceOf(
      Date,
    );
  }, 30_000);

  it("makes security-disable final against a queued push registration", async () => {
    const user = await fixture.createUser();
    const auth = await fixture.nativeLogin(user);
    const barrier = await holdUserSecurityLock(user.id);
    try {
      const disable = executeControlledSecurityDisable(command(user.id), environment());
      await waitForAdvisoryWaiters(1);
      const push = fixture.request("/v1/staff/push/registrations", {
        authorization: `Bearer ${auth.accessToken}`,
        body: pushBody(),
        method: "PUT",
      });
      await waitForAdvisoryWaiters(2);
      await releaseBarrier(barrier);
      await expect(disable).resolves.toMatchObject({ userId: user.id });
      expect((await push).status).not.toBe(200);
    } catch (error) {
      await barrier.query("ROLLBACK").catch(() => undefined);
      await barrier.end().catch(() => undefined);
      throw error;
    }
    const registrations = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM staff_push_registrations AS registration
       INNER JOIN staff_auth_sessions AS session
         ON session.id=registration.staff_auth_session_id
       WHERE session.user_id=$1 AND registration.state='ACTIVE'`,
      [user.id],
    );
    expect(registrations.rows[0]?.count).toBe("0");
  }, 30_000);

  it("keeps future login and refresh denied after disable commits", async () => {
    const user = await fixture.createUser();
    const auth = await fixture.nativeLogin(user);
    await executeControlledSecurityDisable(command(user.id), environment());
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    expect(login.status).toBe(401);
    expect((await fixture.refresh(auth.refreshToken)).status).toBe(401);
  }, 30_000);
});

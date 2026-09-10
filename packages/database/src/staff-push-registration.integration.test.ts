import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  StaffPushTestContext,
  type StaffPushScope,
} from "./staff-push-test-context.js";

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
}

const context = new StaffPushTestContext();
let first: StaffPushScope;
let second: StaffPushScope;

async function expectDatabaseError(
  operation: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL to reject the operation.");
  } catch (error) {
    const postgresError = error as PostgresError;
    expect(postgresError.code).toBe(code);
    if (constraint !== undefined) {
      expect(postgresError.constraint).toBe(constraint);
    }
  }
}

beforeAll(async () => {
  await context.setup();
  first = await context.createScope();
  second = await context.createScope();
}, 120_000);
afterAll(() => context.teardown(), 60_000);

describe("StaffPushRegistration database invariants", () => {
  it("stores FCM/Android and APNS/iOS without provider-specific entities", async () => {
    const androidId = await context.createRegistration(first);
    const iosId = await context.createRegistration(first, {
      platform: "IOS",
      provider: "APNS",
    });
    const result = await context.client.query<{
      app_identifier: string;
      platform: string;
      provider: string;
    }>(
      `SELECT provider, platform, app_identifier
       FROM staff_push_registrations WHERE id = ANY($1::uuid[])
       ORDER BY provider`,
      [[androidId, iosId]],
    );
    expect(result.rows).toEqual([
      {
        app_identifier: "com.vaylet.employee",
        platform: "ANDROID",
        provider: "FCM",
      },
      {
        app_identifier: "com.vaylet.employee",
        platform: "IOS",
        provider: "APNS",
      },
    ]);
  });

  it("rejects invalid provider/platform/application combinations", async () => {
    await expectDatabaseError(
      context.createRegistration(first, { platform: "IOS", provider: "FCM" }),
      "23514",
      "staff_push_registrations_provider_app_check",
    );
    await expectDatabaseError(
      context.createRegistration(first, { appIdentifier: "other.app" }),
      "23514",
      "staff_push_registrations_provider_app_check",
    );
  });

  it("allows one ACTIVE registration per installation and token hash", async () => {
    const installationId = randomUUID();
    await context.createRegistration(first, {
      installationId,
      tokenSeed: "installation-winner",
    });
    await expectDatabaseError(
      context.createRegistration(first, {
        installationId,
        tokenSeed: "installation-loser",
      }),
      "23505",
      "staff_push_registrations_active_installation_key",
    );

    await context.createRegistration(first, { tokenSeed: "token-winner" });
    await expectDatabaseError(
      context.createRegistration(second, { tokenSeed: "token-winner" }),
      "23505",
      "staff_push_registrations_active_token_hash_key",
    );
  });

  it("binds each registration to an exact existing Staff session", async () => {
    await expectDatabaseError(
      context.createRegistration(first, {
        staffAuthSessionId: randomUUID(),
      }),
      "23503",
      "staff_push_registrations_staff_auth_session_id_fkey",
    );
    const registrationId = await context.createRegistration(first);
    await expectDatabaseError(
      context.client.query(`DELETE FROM staff_auth_sessions WHERE id = $1`, [
        first.staffAuthSessionId,
      ]),
      "23503",
      "staff_push_registrations_staff_auth_session_id_fkey",
    );
    expect(registrationId).toBeDefined();
  });

  it("requires terminal token clearing and never reactivates a terminal row", async () => {
    const registrationId = await context.createRegistration(first);
    await expectDatabaseError(
      context.client.query(
        `UPDATE staff_push_registrations
         SET state = 'DISABLED', terminal_at = transaction_timestamp(),
             terminal_reason_class = 'EXPLICIT_DISABLE',
             updated_at = transaction_timestamp()
         WHERE id = $1`,
        [registrationId],
      ),
      "23514",
      "staff_push_registrations_state_shape_check",
    );
    await context.client.query(
      `UPDATE staff_push_registrations
       SET state = 'DISABLED', provider_token = NULL,
           terminal_at = transaction_timestamp(),
           terminal_reason_class = 'EXPLICIT_DISABLE',
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [registrationId],
    );
    await expectDatabaseError(
      context.client.query(
        `UPDATE staff_push_registrations
         SET state = 'ACTIVE', provider_token = 'synthetic-reactivation',
             terminal_at = NULL, terminal_reason_class = NULL,
             updated_at = transaction_timestamp()
         WHERE id = $1`,
        [registrationId],
      ),
      "23514",
    );
  });

  it("supports one deferred atomic supersession to a new ACTIVE row", async () => {
    const installationId = randomUUID();
    const oldId = await context.createRegistration(first, { installationId });
    const newId = randomUUID();
    const newToken = `synthetic-${randomUUID()}`;
    const newHash = `staff-push-token-sha256:v1:${createHash("sha256")
      .update(newToken)
      .digest("hex")}`;
    await context.client.query("BEGIN");
    try {
      await context.client.query(
        `UPDATE staff_push_registrations
         SET state = 'SUPERSEDED', provider_token = NULL,
             terminal_at = transaction_timestamp(),
             terminal_reason_class = 'TOKEN_ROTATION',
             superseded_by_registration_id = $2,
             updated_at = transaction_timestamp()
         WHERE id = $1`,
        [oldId, newId],
      );
      await context.client.query(
        `INSERT INTO staff_push_registrations
           (id, staff_auth_session_id, provider, platform, app_identifier,
            installation_id, provider_token, token_hash, app_version,
            app_build, locale)
         VALUES ($1, $2, 'FCM', 'ANDROID', 'com.vaylet.employee', $3, $4,
                 $5, 'test-version', 'test-build', 'en')`,
        [newId, first.staffAuthSessionId, installationId, newToken, newHash],
      );
      await context.client.query("COMMIT");
    } catch (error) {
      await context.client.query("ROLLBACK");
      throw error;
    }
    const result = await context.client.query<{
      provider_token: string | null;
      state: string;
      superseded_by_registration_id: string | null;
    }>(
      `SELECT state, provider_token, superseded_by_registration_id
       FROM staff_push_registrations WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[oldId, newId]],
    );
    expect(result.rows).toEqual(
      expect.arrayContaining([
        {
          provider_token: null,
          state: "SUPERSEDED",
          superseded_by_registration_id: newId,
        },
        {
          provider_token: newToken,
          state: "ACTIVE",
          superseded_by_registration_id: null,
        },
      ]),
    );
  });

  it("does not write token material into audit or external notifications", async () => {
    const before = await context.client.query<{
      audits: string;
      notices: string;
    }>(
      `SELECT (SELECT count(*)::text FROM audit_events) AS audits,
              (SELECT count(*)::text FROM notifications) AS notices`,
    );
    await context.createRegistration(first, { tokenSeed: "redaction-proof" });
    const after = await context.client.query<{
      audits: string;
      notices: string;
    }>(
      `SELECT (SELECT count(*)::text FROM audit_events) AS audits,
              (SELECT count(*)::text FROM notifications) AS notices`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

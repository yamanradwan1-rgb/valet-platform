import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectRefundInsertAuthority } from "./refund-runtime-role-assertions";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_008e_role_${suffix}`;
const runtimeRole = `valet_008e_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;
let runtimePool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runScript(
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        NODE_ENV: "test",
      },
      windowsHide: true,
    });
    let output = "";
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database script failed: ${output}`)),
    );
  });
}

async function expectDenied(operation: Promise<unknown>) {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as { code?: string }).code).toBe("42501");
  }
}

async function createFixture() {
  const ids = {
    locationId: randomUUID(),
    membershipId: randomUUID(),
    organizationId: randomUUID(),
    paymentId: randomUUID(),
    refundId: randomUUID(),
    sessionId: randomUUID(),
    userId: randomUUID(),
    vehicleId: randomUUID(),
  };
  await adminPool.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Provider role tenant', 'Asia/Amman', transaction_timestamp())`,
    [ids.organizationId],
  );
  await adminPool.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        updated_at)
     VALUES ($1, $2, 'Provider role location', $3, 'Address', 'Asia/Amman',
             'JOD', transaction_timestamp())`,
    [ids.locationId, ids.organizationId, randomUUID()],
  );
  await adminPool.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
    [ids.userId, `${randomUUID()}@provider-role.test`],
  );
  await adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, updated_at)
     VALUES ($1, $2, $3, 'LOCATION_MANAGER', transaction_timestamp())`,
    [ids.membershipId, ids.organizationId, ids.userId],
  );
  await adminPool.query(
    `INSERT INTO vehicles
       (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'Provider role vehicle', transaction_timestamp())`,
    [ids.vehicleId, ids.organizationId],
  );
  await adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, updated_at)
     VALUES ($1, $2, transaction_timestamp(), $3, $4, $5, 'CHECKING_IN',
             $6, transaction_timestamp())`,
    [
      ids.sessionId,
      `provider-role:${randomUUID()}`,
      ids.organizationId,
      ids.locationId,
      ids.vehicleId,
      ids.membershipId,
    ],
  );
  await adminPool.query(
    `INSERT INTO payments
       (id, organization_id, location_id, valet_session_id, service_payer,
        collection_method, currency, service_amount, tip_amount, amount_due,
        amount_paid, status, creation_idempotency_key, provider,
        provider_reference, paid_at, updated_at)
     VALUES ($1, $2, $3, $4, 'CUSTOMER', 'DIGITAL', 'JOD', 5, 0, 5, 5,
             'PAID', $5, 'provider-a', 'payment-reference',
             transaction_timestamp(), transaction_timestamp())`,
    [
      ids.paymentId,
      ids.organizationId,
      ids.locationId,
      ids.sessionId,
      randomUUID(),
    ],
  );
  await adminPool.query(
    `INSERT INTO refunds
       (id, organization_id, payment_id, amount, reason, status,
        authorized_by_membership_id, idempotency_key, provider, requested_at)
     VALUES ($1, $2, $3, 1, 'Provider role refund', 'PENDING', $4, $5,
             'provider-a', transaction_timestamp())`,
    [
      ids.refundId,
      ids.organizationId,
      ids.paymentId,
      ids.membershipId,
      randomUUID(),
    ],
  );
  return ids;
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const migrationUrl = scopedUrl();
  await runScript([prismaCli, "migrate", "deploy"], migrationUrl);
  await runScript(
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    scopedUrl(runtimeRole, runtimePassword),
  );
  adminPool = new Pool({ connectionString: migrationUrl });
  runtimePool = new Pool({
    connectionString: scopedUrl(runtimeRole, runtimePassword),
  });
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("VAL-008E runtime provider-event privileges", () => {
  it("allows provider-event SELECT/INSERT and denies all other authority", async () => {
    const fixture = await createFixture();
    const eventId = randomUUID();
    await runtimePool.query(
      `INSERT INTO payment_provider_events
         (id, organization_id, payment_id, provider, provider_event_id,
          provider_reference, processing_status, received_at, processed_at)
       VALUES ($1, $2, $3, 'provider-a', $4, 'payment-reference', 'PROCESSED',
               transaction_timestamp(), transaction_timestamp())`,
      [eventId, fixture.organizationId, fixture.paymentId, randomUUID()],
    );
    await expect(
      runtimePool.query(
        `SELECT id FROM payment_provider_events WHERE id = $1`,
        [eventId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectDenied(
      runtimePool.query(
        `UPDATE payment_provider_events SET safe_result_code = 'X' WHERE id = $1`,
        [eventId],
      ),
    );
    await expectDenied(
      runtimePool.query(`DELETE FROM payment_provider_events WHERE id = $1`, [
        eventId,
      ]),
    );
    await expectDenied(runtimePool.query(`TRUNCATE payment_provider_events`));
    const authority = await adminPool.query(
      `SELECT privilege,
              has_table_privilege($1, 'public.payment_provider_events', privilege) AS allowed
       FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
       ORDER BY privilege`,
      [runtimeRole],
    );
    expect(authority.rows).toEqual([
      { allowed: false, privilege: "DELETE" },
      { allowed: true, privilege: "INSERT" },
      { allowed: false, privilege: "REFERENCES" },
      { allowed: true, privilege: "SELECT" },
      { allowed: false, privilege: "TRIGGER" },
      { allowed: false, privilege: "TRUNCATE" },
      { allowed: false, privilege: "UPDATE" },
    ]);
  });

  it("allows exact Refund creation and reconciliation columns only", async () => {
    const fixture = await createFixture();
    await expect(
      runtimePool.query(`SELECT id FROM refunds WHERE id = $1`, [
        fixture.refundId,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await runtimePool.query(
      `UPDATE refunds SET status = 'SUCCEEDED', provider_reference = $2,
                          completed_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.refundId, randomUUID()],
    );
    await expectDenied(
      runtimePool.query(`UPDATE refunds SET amount = amount WHERE id = $1`, [
        fixture.refundId,
      ]),
    );
    const insertedId = randomUUID();
    await runtimePool.query(
      `INSERT INTO refunds
         (id, organization_id, payment_id, amount, reason, status,
          authorized_by_membership_id, idempotency_key, provider,
          requested_at, completed_at)
       SELECT $2, organization_id, payment_id, 1, 'allowed', 'PENDING',
              authorized_by_membership_id, $3, provider,
              transaction_timestamp(), NULL
       FROM refunds WHERE id = $1`,
      [fixture.refundId, insertedId, randomUUID()],
    );
    await expect(
      runtimePool.query(`SELECT id FROM refunds WHERE id = $1`, [insertedId]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectDenied(
      runtimePool.query(`DELETE FROM refunds WHERE id = $1`, [
        fixture.refundId,
      ]),
    );
    await expectDenied(runtimePool.query(`TRUNCATE refunds`));
    const columns = await adminPool.query(
      `SELECT column_name,
              has_column_privilege($1, 'public.refunds', column_name, 'UPDATE') AS allowed
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'refunds'
       ORDER BY ordinal_position`,
      [runtimeRole],
    );
    const mutable = new Set(["status", "provider_reference", "completed_at"]);
    for (const row of columns.rows)
      expect(row.allowed).toBe(mutable.has(row.column_name));
    expect(
      await adminPool.query(
        `SELECT has_table_privilege($1, 'public.refunds', 'UPDATE') AS broad`,
        [runtimeRole],
      ),
    ).toMatchObject({ rows: [{ broad: false }] });
    await expectRefundInsertAuthority(adminPool, runtimeRole);
  });
});

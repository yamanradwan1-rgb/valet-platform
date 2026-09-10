import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { Client } from "pg";

const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationsRoot = new URL("../prisma/migrations/", import.meta.url);

export interface StaffPushScope {
  locationId: string;
  membershipId: string;
  organizationId: string;
  staffAuthSessionId: string;
  taskId: string;
  userId: string;
  valetSessionId: string;
}

export class StaffPushTestContext {
  readonly databaseName = `valet_push_${randomUUID().replaceAll("-", "")}`;
  readonly databaseUrl = new URL(baseDatabaseUrl);
  client!: Client;

  constructor() {
    this.databaseUrl.pathname = `/${this.databaseName}`;
  }

  async setup(): Promise<void> {
    const bootstrap = new Client({ connectionString: baseDatabaseUrl });
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE DATABASE "${this.databaseName}"`);
    } finally {
      await bootstrap.end();
    }
    this.client = new Client({ connectionString: this.databaseUrl.toString() });
    await this.client.connect();
    const migrations = (await readdir(migrationsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migration of migrations) {
      await this.client.query(
        await readFile(
          new URL(`${migration}/migration.sql`, migrationsRoot),
          "utf8",
        ),
      );
    }
  }

  async teardown(): Promise<void> {
    await this.client?.end();
    const bootstrap = new Client({ connectionString: baseDatabaseUrl });
    await bootstrap.connect();
    try {
      await bootstrap.query(
        `DROP DATABASE "${this.databaseName}" WITH (FORCE)`,
      );
    } finally {
      await bootstrap.end();
    }
  }

  async createScope(): Promise<StaffPushScope> {
    const scope = {
      locationId: randomUUID(),
      membershipId: randomUUID(),
      organizationId: randomUUID(),
      staffAuthSessionId: randomUUID(),
      taskId: randomUUID(),
      userId: randomUUID(),
      valetSessionId: randomUUID(),
    };
    const vehicleId = randomUUID();
    const accessHash = `staff-access-sha256:v1:${createHash("sha256")
      .update(scope.staffAuthSessionId)
      .digest("hex")}`;
    await this.client.query(
      `INSERT INTO organizations (id, name, timezone, updated_at)
       VALUES ($1, 'Push test tenant', 'Asia/Amman', transaction_timestamp())`,
      [scope.organizationId],
    );
    await this.client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          updated_at)
       VALUES ($1, $2, 'Push test location', $3, 'Address', 'Asia/Amman',
               'JOD', transaction_timestamp())`,
      [scope.locationId, scope.organizationId, randomUUID()],
    );
    await this.client.query(
      `INSERT INTO users (id, email, password_hash, updated_at)
       VALUES ($1, $2, 'test-password-hash', transaction_timestamp())`,
      [scope.userId, `${randomUUID()}@push.test`],
    );
    await this.client.query(
      `INSERT INTO staff_auth_sessions
         (id, user_id, current_access_token_hash, access_expires_at,
          absolute_expires_at, last_rotated_at)
       VALUES ($1, $2, $3, transaction_timestamp() + interval '1 hour',
               transaction_timestamp() + interval '1 day',
               transaction_timestamp())`,
      [scope.staffAuthSessionId, scope.userId, accessHash],
    );
    await this.client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, updated_at)
       VALUES ($1, $2, $3, 'VALET_EMPLOYEE', transaction_timestamp())`,
      [scope.membershipId, scope.organizationId, scope.userId],
    );
    await this.client.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, 'Push test vehicle', transaction_timestamp())`,
      [vehicleId, scope.organizationId],
    );
    await this.client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 hour', $3, $4,
               $5, 'REQUESTED', $6, transaction_timestamp())`,
      [
        scope.valetSessionId,
        `push-test:${randomUUID()}`,
        scope.organizationId,
        scope.locationId,
        vehicleId,
        scope.membershipId,
      ],
    );
    await this.client.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED',
               transaction_timestamp())`,
      [
        scope.taskId,
        scope.organizationId,
        scope.locationId,
        scope.valetSessionId,
      ],
    );
    return scope;
  }

  async createRegistration(
    scope: StaffPushScope,
    values: {
      appIdentifier?: string;
      id?: string;
      installationId?: string;
      platform?: string;
      provider?: string;
      staffAuthSessionId?: string;
      tokenSeed?: string;
    } = {},
  ): Promise<string> {
    const id = values.id ?? randomUUID();
    const token = `synthetic-${values.tokenSeed ?? randomUUID()}`;
    const tokenHash = `staff-push-token-sha256:v1:${createHash("sha256")
      .update(token)
      .digest("hex")}`;
    await this.client.query(
      `INSERT INTO staff_push_registrations
         (id, staff_auth_session_id, provider, platform, app_identifier,
          installation_id, provider_token, token_hash, app_version, app_build,
          locale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'test-version',
               'test-build', 'en')`,
      [
        id,
        values.staffAuthSessionId ?? scope.staffAuthSessionId,
        values.provider ?? "FCM",
        values.platform ?? "ANDROID",
        values.appIdentifier ?? "com.vaylet.employee",
        values.installationId ?? randomUUID(),
        token,
        tokenHash,
      ],
    );
    return id;
  }

  async createIntent(
    scope: StaffPushScope,
    values: Partial<StaffPushScope> & { expiresAt?: Date; id?: string } = {},
  ): Promise<string> {
    const id = values.id ?? randomUUID();
    await this.client.query(
      `INSERT INTO staff_push_intents
         (id, organization_id, location_id, valet_session_id, task_id, kind,
          policy_version, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'EMPLOYEE_RETRIEVAL_REQUESTED', 1, $6)`,
      [
        id,
        values.organizationId ?? scope.organizationId,
        values.locationId ?? scope.locationId,
        values.valetSessionId ?? scope.valetSessionId,
        values.taskId ?? scope.taskId,
        values.expiresAt ?? new Date(Date.now() + 60_000),
      ],
    );
    return id;
  }

  createDelivery(
    scope: StaffPushScope,
    intentId: string,
    registrationId: string,
    values: { maxAttempts?: number; organizationId?: string } = {},
  ) {
    return this.client.query(
      `INSERT INTO staff_push_deliveries
         (id, organization_id, intent_id, registration_id,
          recipient_membership_id, max_attempts, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $6, transaction_timestamp())
       RETURNING id`,
      [
        randomUUID(),
        values.organizationId ?? scope.organizationId,
        intentId,
        registrationId,
        scope.membershipId,
        values.maxAttempts ?? 2,
      ],
    );
  }

  async claimDelivery(scope: StaffPushScope): Promise<{
    deliveryId: string;
    leaseToken: string;
  }> {
    const intentId = await this.createIntent(scope);
    const registrationId = await this.createRegistration(scope);
    const inserted = await this.createDelivery(scope, intentId, registrationId);
    const deliveryId = inserted.rows[0]!.id as string;
    const leaseToken = randomUUID();
    await this.client.query(
      `UPDATE staff_push_deliveries
       SET state = 'LEASED', attempt_count = 1, next_attempt_at = NULL,
           lease_token = $2,
           lease_expires_at = transaction_timestamp() + interval '1 minute',
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [deliveryId, leaseToken],
    );
    return { deliveryId, leaseToken };
  }
}

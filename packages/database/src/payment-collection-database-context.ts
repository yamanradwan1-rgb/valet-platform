import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";

const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationsPath = new URL("../prisma/migrations/", import.meta.url);

export interface CollectionPaymentFixture {
  readonly locationId: string;
  readonly organizationId: string;
  readonly paymentId: string;
  readonly sessionId: string;
}

export class PaymentCollectionDatabaseContext {
  readonly databaseName = `valet_collection_${randomUUID().replaceAll("-", "")}`;
  readonly databaseUrl = new URL(baseDatabaseUrl);
  client!: Client;
  migrationDirectories: string[] = [];

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
    this.migrationDirectories = (
      await readdir(migrationsPath, {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const directory of this.migrationDirectories) {
      await this.client.query(
        await readFile(
          new URL(`${directory}/migration.sql`, migrationsPath),
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

  async createPayment(
    organizationId: string = randomUUID(),
  ): Promise<CollectionPaymentFixture> {
    const locationId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    const paymentId = randomUUID();
    await this.client.query(
      `INSERT INTO organizations (id, name, timezone, updated_at)
       VALUES ($1, 'Collection tenant', 'Asia/Amman', transaction_timestamp())
       ON CONFLICT (id) DO NOTHING`,
      [organizationId],
    );
    await this.client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          updated_at)
       VALUES ($1, $2, 'Collection location', $3, 'Address', 'Asia/Amman',
               'JOD', transaction_timestamp())`,
      [locationId, organizationId, randomUUID()],
    );
    await this.client.query(
      `INSERT INTO users (id, email, password_hash, updated_at)
       VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
      [userId, `${randomUUID()}@collection.test`],
    );
    await this.client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, updated_at)
       VALUES ($1, $2, $3, 'LOCATION_MANAGER', transaction_timestamp())`,
      [membershipId, organizationId, userId],
    );
    await this.client.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, 'Collection vehicle', transaction_timestamp())`,
      [vehicleId, organizationId],
    );
    await this.client.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, updated_at)
       VALUES ($1, $2, transaction_timestamp(), $3, $4, $5, 'CHECKING_IN',
               $6, transaction_timestamp())`,
      [
        sessionId,
        `collection-disabled:${randomUUID()}`,
        organizationId,
        locationId,
        vehicleId,
        membershipId,
      ],
    );
    await this.client.query(
      `INSERT INTO payments
         (id, organization_id, location_id, valet_session_id, service_payer,
          collection_method, currency, service_amount, tip_amount, amount_due,
          amount_paid, status, creation_idempotency_key, updated_at)
       VALUES ($1, $2, $3, $4, 'CUSTOMER', 'CASH', 'JOD', 5, 0, 5, 0,
               'UNPAID', $5, transaction_timestamp())`,
      [paymentId, organizationId, locationId, sessionId, randomUUID()],
    );
    return { locationId, organizationId, paymentId, sessionId };
  }

  insertOperation(
    fixture: CollectionPaymentFixture,
    input: {
      amount?: string;
      currency?: string;
      dispatchGuardedAt?: Date | null;
      id?: string;
      provider?: string;
      providerReference?: string | null;
      resolvedAt?: Date | null;
      state?: string;
      submissionKey?: string;
    } = {},
  ) {
    return this.client.query(
      `INSERT INTO payment_collection_operations
         (id, organization_id, payment_id, submission_idempotency_key,
          amount, currency, provider, state, provider_reference,
          dispatch_guarded_at, resolved_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8, $9, $10, $11,
               transaction_timestamp())`,
      [
        input.id ?? randomUUID(),
        fixture.organizationId,
        fixture.paymentId,
        input.submissionKey ?? randomUUID(),
        input.amount ?? "5.000",
        input.currency ?? "JOD",
        input.provider ?? "provider-a",
        input.state ?? "PREPARED",
        input.providerReference ?? null,
        input.dispatchGuardedAt ?? null,
        input.resolvedAt ?? null,
      ],
    );
  }
}

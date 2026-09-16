import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";
import {
  createScopedParkingSpot,
  ensureParkingSpotZone,
} from "./schema-parking-fixture.js";

interface PostgresError extends Error {
  code?: string;
  column?: string;
  constraint?: string;
}

interface TenantFixture {
  locationId: string;
  organizationId: string;
}

interface StaffFixture {
  membershipId: string;
  userId: string;
}

interface VehicleValues {
  color?: string | null;
  make?: string | null;
  model?: string | null;
  plateCountry?: string | null;
  plateNumberNormalized?: string | null;
  plateNumberRaw?: string | null;
  temporaryDescriptor?: string | null;
}

interface KeySlotValues {
  code?: string;
  status?: string;
}

interface ValetSessionFixture extends TenantFixture {
  checkedInByMembershipId: string;
  vehicleId: string;
}

interface ValetSessionValues {
  completedAt?: Date | null;
  completedByMembershipId?: string | null;
  currentAssigneeMembershipId?: string | null;
  customerAccessExpiresAt?: Date;
  customerAccessRevokedAt?: Date | null;
  customerAccessTokenHash?: string;
  customerId?: string | null;
  keySlotId?: string | null;
  organizationId?: string;
  parkingZoneId?: string | null;
  parkingSpotId?: string | null;
  state?: string;
  version?: number;
}

interface AuditEventValues {
  actorMembershipId?: string | null;
  entityId?: string;
  entityType?: string;
  eventType?: string;
  idempotencyKey?: string | null;
  metadataJson?: Record<string, unknown>;
  occurredAt?: Date;
  organizationId?: string;
  valetSessionId?: string | null;
}

interface RetrievalRequestFixture {
  organizationId: string;
  valetSessionId: string;
}

interface RetrievalRequestTestFixture extends RetrievalRequestFixture {
  customerId: string;
  membershipId: string;
}

interface RetrievalRequestValues {
  cancelledAt?: Date | null;
  organizationId?: string;
  requestedAt?: Date;
  requestedByCustomerId?: string | null;
  requestedByMembershipId?: string | null;
  requestedByType: string;
  status?: string;
}

interface HandoffVerificationFixture {
  organizationId: string;
  valetSessionId: string;
}

interface HandoffVerificationTestFixture extends HandoffVerificationFixture {
  membershipId: string;
}

interface HandoffVerificationValues {
  attemptCount?: number;
  consumedAt?: Date | null;
  expiresAt?: Date | null;
  maxAttempts: number;
  method: string;
  organizationId?: string;
  overrideReason?: string | null;
  secretHash?: string | null;
  verifiedAt?: Date | null;
  verifiedByMembershipId?: string | null;
}

interface PaymentFixture extends TenantFixture {
  membershipId: string;
  valetSessionId: string;
}

interface PaymentValues {
  amountDue?: string;
  amountPaid?: string;
  collectionMethod?: string;
  creationIdempotencyKey?: string;
  currency?: string;
  locationId?: string;
  organizationId?: string;
  paidAt?: Date | null;
  provider?: string | null;
  providerReference?: string | null;
  serviceAmount?: string;
  servicePayer?: string;
  status?: string;
  tipAmount?: string;
  valetSessionId?: string;
}

interface ValidationValues {
  amount?: string;
  appliedAt?: Date;
  appliedByMembershipId?: string;
  isCurrent?: boolean;
  mode?: string;
  organizationId?: string;
  paymentId?: string;
  supersedesValidationId?: string | null;
}

interface CashEntryValues {
  amount?: string;
  entryType?: string;
  occurredAt?: Date;
  organizationId?: string;
  paymentId?: string;
  reason?: string | null;
  receivedOrAdjustedByMembershipId?: string;
  submissionIdempotencyKey?: string;
}

interface PaymentProviderEventValues {
  organizationId?: string;
  paymentId?: string;
  processedAt?: Date;
  processingStatus?: string;
  provider?: string;
  providerEventId?: string;
  providerReference?: string | null;
  receivedAt?: Date;
  refundId?: string | null;
  safeResultCode?: string | null;
}

interface RefundValues {
  amount?: string;
  authorizedByMembershipId?: string;
  completedAt?: Date | null;
  idempotencyKey?: string;
  organizationId?: string;
  paymentId?: string;
  provider?: string | null;
  providerReference?: string | null;
  reason?: string;
  requestedAt?: Date;
  status?: string;
}

interface IncidentValues {
  description?: string;
  locationId?: string;
  organizationId?: string;
  reportedByMembershipId?: string;
  resolutionNotes?: string | null;
  resolvedAt?: Date | null;
  resolvedByMembershipId?: string | null;
  severity?: string;
  status?: string;
  type?: string;
  valetSessionId?: string;
}

interface NotificationValues {
  channel?: string;
  failedAt?: Date | null;
  organizationId?: string;
  providerReference?: string | null;
  recipient?: string;
  sentAt?: Date | null;
  status?: string;
  templateKey?: string;
  valetSessionId?: string | null;
}

interface CheckInIntakeFixture extends ValetSessionFixture {
  valetSessionId: string;
}

interface ConditionNoteValues {
  content?: string;
  context?: string;
  locationId?: string;
  organizationId?: string;
  recordedByMembershipId?: string;
  supersedesConditionNoteId?: string | null;
  valetSessionId?: string;
}

interface VehiclePhotoValues {
  capturedByMembershipId?: string;
  contentType?: string;
  locationId?: string;
  organizationId?: string;
  purpose?: string;
  storageObjectKey?: string;
  valetSessionId?: string;
}

interface IncrementalMigrationFixture {
  locationId: string;
  organizationId: string;
  valetSessionId: string;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const testDatabaseName = `valet_003n_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let databaseCreated = false;
let databaseClient: Client;
let appliedMigrationDirectories: string[] = [];
let incrementalMigrationFixture: IncrementalMigrationFixture;

function connectionUrlFor(databaseName: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function expectPostgresError(
  operation: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL error ${code}.`);
  } catch (error) {
    const postgresError = error as PostgresError;
    expect(postgresError.code).toBe(code);
    if (constraint !== undefined) {
      expect(postgresError.constraint).toBe(constraint);
    }
  }
}

async function expectNotNullViolation(
  operation: Promise<unknown>,
  column: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL NOT NULL error for ${column}.`);
  } catch (error) {
    const postgresError = error as PostgresError;
    expect(postgresError.code).toBe("23502");
    expect(postgresError.column).toBe(column);
  }
}

async function createPreVal004CFixture(
  client: Client,
): Promise<IncrementalMigrationFixture> {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const vehicleId = randomUUID();
  const valetSessionId = randomUUID();

  await client.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, 'Pre-VAL-004C organization', 'Asia/Amman', CURRENT_TIMESTAMP)`,
    [organizationId],
  );
  await client.query(
    `INSERT INTO locations (
       id, organization_id, name, code, address_text,
       timezone, currency, updated_at
     ) VALUES (
       $1, $2, 'Pre-VAL-004C location', $3, 'Amman',
       'Asia/Amman', 'JOD', CURRENT_TIMESTAMP
     )`,
    [locationId, organizationId, `PRE-${randomUUID()}`],
  );
  await client.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-password-hash', CURRENT_TIMESTAMP)`,
    [userId, `${randomUUID()}@pre-val-004c.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships (
       id, organization_id, user_id, role, updated_at
     ) VALUES ($1, $2, $3, 'VALET_EMPLOYEE', CURRENT_TIMESTAMP)`,
    [membershipId, organizationId, userId],
  );
  await client.query(
    `INSERT INTO vehicles (
       id, organization_id, temporary_descriptor, updated_at
     ) VALUES ($1, $2, 'Pre-VAL-004C vehicle', CURRENT_TIMESTAMP)`,
    [vehicleId, organizationId],
  );
  await client.query(
    `INSERT INTO valet_sessions (
       id, customer_access_token_hash, customer_access_expires_at,
       organization_id, location_id, vehicle_id, state,
       checked_in_by_membership_id, updated_at
     ) VALUES (
       $1, $2, CURRENT_TIMESTAMP + interval '1 hour',
       $3, $4, $5, 'CHECKING_IN', $6, CURRENT_TIMESTAMP
     )`,
    [
      valetSessionId,
      `sha256:${randomUUID().replaceAll("-", "")}`,
      organizationId,
      locationId,
      vehicleId,
      membershipId,
    ],
  );

  return { locationId, organizationId, valetSessionId };
}

async function applyMigrations(client: Client): Promise<void> {
  const migrationDirectories = (
    await readdir(migrationsPath, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  appliedMigrationDirectories = migrationDirectories;

  for (const migrationDirectory of migrationDirectories) {
    if (migrationDirectory === "20260809001500_check_in_intake_persistence") {
      incrementalMigrationFixture = await createPreVal004CFixture(client);
    }
    const migrationSql = await readFile(
      join(migrationsPath, migrationDirectory, "migration.sql"),
      "utf8",
    );
    await client.query(migrationSql);
  }
}

async function createOrganization(name = "Valet Operator"): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO organizations (id, name, timezone, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [id, name, "Asia/Amman"],
  );
  return id;
}

async function createCustomer(
  organizationId: string,
  phoneNormalized = `+9627${Date.now()}${Math.floor(Math.random() * 1_000)}`,
  displayName: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO customers (
       id, organization_id, phone_normalized, display_name, updated_at
     ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [id, organizationId, phoneNormalized, displayName],
  );
  return id;
}

async function createVehicle(
  organizationId: string,
  values: VehicleValues = {},
): Promise<string> {
  const id = randomUUID();
  const {
    color = null,
    make = null,
    model = null,
    plateCountry = "JO",
    plateNumberNormalized = randomUUID(),
    plateNumberRaw = "12-34567",
    temporaryDescriptor = null,
  } = values;

  await databaseClient.query(
    `INSERT INTO vehicles (
       id, organization_id, plate_country, plate_number_raw,
       plate_number_normalized, temporary_descriptor, make, model, color,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
    [
      id,
      organizationId,
      plateCountry,
      plateNumberRaw,
      plateNumberNormalized,
      temporaryDescriptor,
      make,
      model,
      color,
    ],
  );
  return id;
}

async function createLocation(
  organizationId: string,
  code = `LOC-${randomUUID()}`,
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO locations (
       id, organization_id, name, code, address_text,
       timezone, currency, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
    [id, organizationId, "Main Entrance", code, "Amman", "Asia/Amman", "JOD"],
  );
  return id;
}

const createParkingSpot = (tenant: TenantFixture, values = {}) =>
  createScopedParkingSpot(databaseClient, tenant, values);

async function createKeySlot(
  tenant: TenantFixture,
  values: KeySlotValues = {},
): Promise<string> {
  const id = randomUUID();
  const { code = `KEY-${randomUUID()}`, status } = values;

  if (status === undefined) {
    await databaseClient.query(
      `INSERT INTO key_slots (
         id, organization_id, location_id, code, updated_at
       ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [id, tenant.organizationId, tenant.locationId, code],
    );
  } else {
    await databaseClient.query(
      `INSERT INTO key_slots (
         id, organization_id, location_id, code, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [id, tenant.organizationId, tenant.locationId, code, status],
    );
  }
  return id;
}

async function createUser(
  email = `${randomUUID()}@example.com`,
  phone: string | null = null,
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO users (
       id, email, phone, password_hash, updated_at
     ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [id, email, phone, "test-password-hash"],
  );
  return id;
}

async function createMembership(
  organizationId: string,
  userId: string,
  role = "VALET_EMPLOYEE",
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO organization_memberships (
       id, organization_id, user_id, role, updated_at
     ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [id, organizationId, userId, role],
  );
  return id;
}

async function createTenant(): Promise<TenantFixture> {
  const organizationId = await createOrganization();
  const locationId = await createLocation(organizationId);
  return { locationId, organizationId };
}

async function createStaff(organizationId: string): Promise<StaffFixture> {
  const userId = await createUser();
  const membershipId = await createMembership(organizationId, userId);
  return { membershipId, userId };
}

async function createValetSessionFixture(
  tenant?: TenantFixture,
): Promise<ValetSessionFixture> {
  const resolvedTenant = tenant ?? (await createTenant());
  const vehicleId = await createVehicle(resolvedTenant.organizationId);
  const { membershipId: checkedInByMembershipId } = await createStaff(
    resolvedTenant.organizationId,
  );
  return { ...resolvedTenant, checkedInByMembershipId, vehicleId };
}

async function createValetSession(
  fixture: ValetSessionFixture,
  values: ValetSessionValues = {},
): Promise<string> {
  const id = randomUUID();
  const organizationId = values.organizationId ?? fixture.organizationId;
  const customerAccessTokenHash =
    values.customerAccessTokenHash ??
    `sha256:${randomUUID().replaceAll("-", "")}`;
  const customerAccessExpiresAt =
    values.customerAccessExpiresAt ?? new Date(Date.now() + 60 * 60 * 1_000);
  const customerAccessRevokedAt = values.customerAccessRevokedAt ?? null;
  const state = values.state ?? "CHECKING_IN";
  const customerId = values.customerId ?? null;
  const parkingSpotId = values.parkingSpotId ?? null;
  const parkingZoneId =
    values.parkingZoneId ??
    (parkingSpotId === null
      ? null
      : await ensureParkingSpotZone(databaseClient, parkingSpotId));
  const keySlotId = values.keySlotId ?? null;
  const currentAssigneeMembershipId =
    values.currentAssigneeMembershipId ?? null;
  const completedByMembershipId = values.completedByMembershipId ?? null;
  const completedAt = values.completedAt ?? null;

  const columns = [
    "id",
    "customer_access_token_hash",
    "customer_access_expires_at",
    "customer_access_revoked_at",
    "organization_id",
    "location_id",
    "vehicle_id",
    "customer_id",
    "state",
    "parking_zone_id",
    "parking_spot_id",
    "key_slot_id",
    "current_assignee_membership_id",
    "checked_in_by_membership_id",
    "completed_by_membership_id",
    "completed_at",
    "updated_at",
  ];
  const parameters: unknown[] = [
    id,
    customerAccessTokenHash,
    customerAccessExpiresAt,
    customerAccessRevokedAt,
    organizationId,
    fixture.locationId,
    fixture.vehicleId,
    customerId,
    state,
    parkingZoneId,
    parkingSpotId,
    keySlotId,
    currentAssigneeMembershipId,
    fixture.checkedInByMembershipId,
    completedByMembershipId,
    completedAt,
    new Date(),
  ];

  if (values.version !== undefined) {
    columns.push("version");
    parameters.push(values.version);
  }

  const placeholders = parameters.map((_, index) => `$${index + 1}`);
  await databaseClient.query(
    `INSERT INTO valet_sessions (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})`,
    parameters,
  );
  return id;
}

async function createCheckInIntakeFixture(
  tenant?: TenantFixture,
): Promise<CheckInIntakeFixture> {
  const valetSessionFixture = await createValetSessionFixture(tenant);
  const valetSessionId = await createValetSession(valetSessionFixture);
  return { ...valetSessionFixture, valetSessionId };
}

async function createConditionNote(
  fixture: CheckInIntakeFixture,
  values: ConditionNoteValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO condition_notes (
       id, organization_id, location_id, valet_session_id,
       context, content, supersedes_condition_note_id,
       recorded_by_membership_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.locationId ?? fixture.locationId,
      values.valetSessionId ?? fixture.valetSessionId,
      values.context ?? "CHECK_IN",
      values.content ?? "No visible intake condition concerns",
      values.supersedesConditionNoteId ?? null,
      values.recordedByMembershipId ?? fixture.checkedInByMembershipId,
    ],
  );
  return id;
}

async function createVehiclePhoto(
  fixture: CheckInIntakeFixture,
  values: VehiclePhotoValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO vehicle_photos (
       id, organization_id, location_id, valet_session_id,
       captured_by_membership_id, purpose, storage_object_key, content_type
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.locationId ?? fixture.locationId,
      values.valetSessionId ?? fixture.valetSessionId,
      values.capturedByMembershipId ?? fixture.checkedInByMembershipId,
      values.purpose ?? "CHECK_IN_CONDITION",
      values.storageObjectKey ?? `private/check-in/${randomUUID()}`,
      values.contentType ?? "image/jpeg",
    ],
  );
  return id;
}

async function createAuditEvent(
  tenant: TenantFixture,
  values: AuditEventValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO audit_events (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, event_type, entity_type, entity_id,
       metadata_json, idempotency_key, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6::audit_actor_type,
               $7, $8, $9, $10, $11, $12)`,
    [
      id,
      values.organizationId ?? tenant.organizationId,
      tenant.locationId,
      values.valetSessionId ?? null,
      values.actorMembershipId ?? null,
      values.actorMembershipId == null ? "SYSTEM" : "MEMBERSHIP",
      values.eventType ?? "vehicle.recorded",
      values.entityType ?? "Vehicle",
      values.entityId ?? randomUUID(),
      values.metadataJson ?? { source: "integrity-test", sequence: 1 },
      values.idempotencyKey ?? null,
      values.occurredAt ?? new Date(),
    ],
  );
  return id;
}

async function createRetrievalRequest(
  fixture: RetrievalRequestFixture,
  values: RetrievalRequestValues,
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO retrieval_requests (
       id, organization_id, valet_session_id, requested_by_type,
       requested_by_customer_id, requested_by_membership_id,
       status, requested_at, cancelled_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      fixture.valetSessionId,
      values.requestedByType,
      values.requestedByCustomerId ?? null,
      values.requestedByMembershipId ?? null,
      values.status ?? "OPEN",
      values.requestedAt ?? new Date(),
      values.cancelledAt ?? null,
    ],
  );
  return id;
}

async function createRetrievalRequestTestFixture(): Promise<RetrievalRequestTestFixture> {
  const tenant = await createTenant();
  const valetSessionFixture = await createValetSessionFixture(tenant);
  const valetSessionId = await createValetSession(valetSessionFixture);
  const customerId = await createCustomer(tenant.organizationId);
  const { membershipId } = await createStaff(tenant.organizationId);
  return {
    customerId,
    membershipId,
    organizationId: tenant.organizationId,
    valetSessionId,
  };
}

async function createHandoffVerification(
  fixture: HandoffVerificationFixture,
  values: HandoffVerificationValues,
): Promise<string> {
  const id = randomUUID();
  const columns = [
    "id",
    "organization_id",
    "valet_session_id",
    "method",
    "secret_hash",
    "expires_at",
    "max_attempts",
    "verified_at",
    "verified_by_membership_id",
    "consumed_at",
    "override_reason",
  ];
  const parameters: unknown[] = [
    id,
    values.organizationId ?? fixture.organizationId,
    fixture.valetSessionId,
    values.method,
    values.secretHash ?? null,
    values.expiresAt ?? null,
    values.maxAttempts,
    values.verifiedAt ?? null,
    values.verifiedByMembershipId ?? null,
    values.consumedAt ?? null,
    values.overrideReason ?? null,
  ];

  if (values.attemptCount !== undefined) {
    columns.push("attempt_count");
    parameters.push(values.attemptCount);
  }

  const placeholders = parameters.map((_, index) => `$${index + 1}`);
  await databaseClient.query(
    `INSERT INTO handoff_verifications (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})`,
    parameters,
  );
  return id;
}

async function createHandoffVerificationTestFixture(): Promise<HandoffVerificationTestFixture> {
  const tenant = await createTenant();
  const valetSessionFixture = await createValetSessionFixture(tenant);
  const valetSessionId = await createValetSession(valetSessionFixture);
  const { membershipId } = await createStaff(tenant.organizationId);
  return {
    membershipId,
    organizationId: tenant.organizationId,
    valetSessionId,
  };
}

async function createPaymentTestFixture(
  tenant?: TenantFixture,
): Promise<PaymentFixture> {
  const resolvedTenant = tenant ?? (await createTenant());
  const valetSessionFixture = await createValetSessionFixture(resolvedTenant);
  const valetSessionId = await createValetSession(valetSessionFixture);
  const { membershipId } = await createStaff(resolvedTenant.organizationId);
  return { ...resolvedTenant, membershipId, valetSessionId };
}

async function createPayment(
  fixture: PaymentFixture,
  values: PaymentValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO payments (
       id, organization_id, location_id, valet_session_id,
       service_payer, collection_method, currency,
       service_amount, tip_amount, amount_due, amount_paid,
       status, creation_idempotency_key, provider,
       provider_reference, updated_at, paid_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16, $17
     )`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.locationId ?? fixture.locationId,
      values.valetSessionId ?? fixture.valetSessionId,
      values.servicePayer ?? "CUSTOMER",
      values.collectionMethod ?? "CASH",
      values.currency ?? "JOD",
      values.serviceAmount ?? "10.000",
      values.tipAmount ?? "0.000",
      values.amountDue ?? "10.000",
      values.amountPaid ?? "0.000",
      values.status ?? "UNPAID",
      values.creationIdempotencyKey ?? randomUUID(),
      values.provider ?? null,
      values.providerReference ?? null,
      new Date(),
      values.paidAt ?? null,
    ],
  );
  return id;
}

async function createValidation(
  fixture: PaymentFixture,
  paymentId: string,
  values: ValidationValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO validations (
       id, organization_id, payment_id, mode, amount, is_current,
       supersedes_validation_id, applied_by_membership_id, applied_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.paymentId ?? paymentId,
      values.mode ?? "PARTIAL",
      values.amount ?? "5.000",
      values.isCurrent ?? true,
      values.supersedesValidationId ?? null,
      values.appliedByMembershipId ?? fixture.membershipId,
      values.appliedAt ?? new Date(),
    ],
  );
  return id;
}

async function createCashEntry(
  fixture: PaymentFixture,
  paymentId: string,
  values: CashEntryValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO cash_entries (
       id, organization_id, payment_id, entry_type, amount,
       received_or_adjusted_by_membership_id, reason,
       submission_idempotency_key, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.paymentId ?? paymentId,
      values.entryType ?? "RECEIPT",
      values.amount ?? "10.000",
      values.receivedOrAdjustedByMembershipId ?? fixture.membershipId,
      values.reason ?? null,
      values.submissionIdempotencyKey ?? randomUUID(),
      values.occurredAt ?? new Date(),
    ],
  );
  return id;
}

async function createPaymentProviderEvent(
  fixture: PaymentFixture,
  paymentId: string,
  values: PaymentProviderEventValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO payment_provider_events (
       id, organization_id, payment_id, refund_id, provider,
       provider_event_id, provider_reference, processing_status,
       received_at, processed_at, safe_result_code
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.paymentId ?? paymentId,
      values.refundId ?? null,
      values.provider ?? "gateway",
      values.providerEventId ?? randomUUID(),
      values.providerReference ?? null,
      values.processingStatus ?? "PROCESSED",
      values.receivedAt ?? new Date(),
      values.processedAt ?? new Date(),
      values.safeResultCode ?? null,
    ],
  );
  return id;
}

async function createRefund(
  fixture: PaymentFixture,
  paymentId: string,
  values: RefundValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO refunds (
       id, organization_id, payment_id, amount, reason, status,
       authorized_by_membership_id, idempotency_key, provider,
       provider_reference, requested_at, completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.paymentId ?? paymentId,
      values.amount ?? "5.000",
      values.reason ?? "Customer requested refund",
      values.status ?? "PENDING",
      values.authorizedByMembershipId ?? fixture.membershipId,
      values.idempotencyKey ?? randomUUID(),
      values.provider === undefined ? "gateway" : values.provider,
      values.providerReference ?? null,
      values.requestedAt ?? new Date(),
      values.completedAt ?? null,
    ],
  );
  return id;
}

async function createIncident(
  fixture: PaymentFixture,
  values: IncidentValues = {},
): Promise<string> {
  const id = randomUUID();
  await databaseClient.query(
    `INSERT INTO incidents (
       id, organization_id, location_id, valet_session_id,
       status, severity, type, description,
       reported_by_membership_id, resolved_at,
       resolved_by_membership_id, resolution_notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      values.organizationId ?? fixture.organizationId,
      values.locationId ?? fixture.locationId,
      values.valetSessionId ?? fixture.valetSessionId,
      values.status ?? "OPEN",
      values.severity ?? "MEDIUM",
      values.type ?? "VEHICLE_DAMAGE",
      values.description ?? "Documented operational incident",
      values.reportedByMembershipId ?? fixture.membershipId,
      values.resolvedAt ?? null,
      values.resolvedByMembershipId ?? null,
      values.resolutionNotes ?? null,
    ],
  );
  return id;
}

async function createNotification(
  fixture: PaymentFixture,
  values: NotificationValues = {},
): Promise<string> {
  const id = randomUUID();
  const columns = [
    "id",
    "organization_id",
    "valet_session_id",
    "channel",
    "recipient",
    "template_key",
    "provider_reference",
    "sent_at",
    "failed_at",
  ];
  const parameters: unknown[] = [
    id,
    values.organizationId ?? fixture.organizationId,
    values.valetSessionId === undefined ? null : values.valetSessionId,
    values.channel ?? "SMS",
    values.recipient ?? "synthetic-recipient",
    values.templateKey ?? "vehicle.status",
    values.providerReference ?? null,
    values.sentAt ?? null,
    values.failedAt ?? null,
  ];
  if (values.status !== undefined) {
    columns.splice(6, 0, "status");
    parameters.splice(6, 0, values.status);
  }
  const placeholders = parameters.map((_, index) => `$${index + 1}`);
  await databaseClient.query(
    `INSERT INTO notifications (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})`,
    parameters,
  );
  return id;
}

async function insertShift(
  tenant: TenantFixture,
  membershipId: string,
  options: {
    endedAt?: Date | null;
    startedAt?: Date;
    status?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const startedAt = options.startedAt ?? new Date();
  const endedAt = options.endedAt ?? null;
  const status = options.status ?? "ACTIVE";

  await databaseClient.query(
    `INSERT INTO shifts (
       id, organization_id, location_id, membership_id,
       status, started_at, ended_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      tenant.organizationId,
      tenant.locationId,
      membershipId,
      status,
      startedAt,
      endedAt,
    ],
  );
  return id;
}

beforeAll(async () => {
  expect(testDatabaseName).toMatch(/^valet_003n_\d+_\d+$/);

  const adminClient = new Client({ connectionString: adminDatabaseUrl });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE "${testDatabaseName}"`);
    databaseCreated = true;
  } finally {
    await adminClient.end();
  }

  databaseClient = new Client({
    connectionString: connectionUrlFor(testDatabaseName),
  });
  await databaseClient.connect();
  await applyMigrations(databaseClient);
}, 60_000);

afterAll(async () => {
  if (databaseClient !== undefined) {
    await databaseClient.end();
  }

  if (databaseCreated) {
    const adminClient = new Client({ connectionString: adminDatabaseUrl });
    await adminClient.connect();
    try {
      await adminClient.query(
        `DROP DATABASE "${testDatabaseName}" WITH (FORCE)`,
      );
    } finally {
      await adminClient.end();
    }
  }
}, 60_000);

describe("tenant and staff database foundation", () => {
  it("accepts valid tenant and staff rows", async () => {
    const tenant = await createTenant();
    const sharedPhone = "+962700000000";
    const firstUserId = await createUser(undefined, sharedPhone);
    const secondUserId = await createUser(undefined, sharedPhone);
    const membershipId = await createMembership(
      tenant.organizationId,
      firstUserId,
      "LOCATION_MANAGER",
    );

    await createMembership(tenant.organizationId, secondUserId);
    await databaseClient.query(
      `INSERT INTO membership_location_access (
         organization_id, membership_id, location_id
       ) VALUES ($1, $2, $3)`,
      [tenant.organizationId, membershipId, tenant.locationId],
    );
    await insertShift(tenant, membershipId, {
      endedAt: new Date("2026-08-08T18:00:00.000Z"),
      startedAt: new Date("2026-08-08T17:00:00.000Z"),
      status: "ENDED",
    });

    const result = await databaseClient.query<{ access_count: string }>(
      `SELECT count(*) AS access_count
       FROM membership_location_access
       WHERE organization_id = $1`,
      [tenant.organizationId],
    );
    expect(result.rows[0]?.access_count).toBe("1");
  });

  it("rejects duplicate organization memberships", async () => {
    const organizationId = await createOrganization();
    const userId = await createUser();
    await createMembership(organizationId, userId);

    await expectPostgresError(
      createMembership(organizationId, userId),
      "23505",
      "organization_memberships_organization_id_user_id_key",
    );
  });

  it("accepts VALET_SUPERVISOR as a tenant membership role", async () => {
    const organizationId = await createOrganization();
    const userId = await createUser();
    const membershipId = await createMembership(
      organizationId,
      userId,
      "VALET_SUPERVISOR",
    );

    const result = await databaseClient.query<{ role: string }>(
      "SELECT role::text AS role FROM organization_memberships WHERE id = $1",
      [membershipId],
    );
    expect(result.rows[0]?.role).toBe("VALET_SUPERVISOR");
  });

  it("scopes location-code uniqueness to an organization", async () => {
    const firstOrganizationId = await createOrganization("First Operator");
    const secondOrganizationId = await createOrganization("Second Operator");
    await createLocation(firstOrganizationId, "MAIN");

    await expectPostgresError(
      createLocation(firstOrganizationId, "MAIN"),
      "23505",
      "locations_organization_id_code_key",
    );
    await expect(
      createLocation(secondOrganizationId, "MAIN"),
    ).resolves.toBeTypeOf("string");
  });

  it("requires a Location timezone", async () => {
    const organizationId = await createOrganization();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO locations (
           id, organization_id, name, code, address_text,
           currency, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          organizationId,
          "Missing Timezone",
          `TZ-${randomUUID()}`,
          "Amman",
          "JOD",
        ],
      ),
      "timezone",
    );
  });

  it("requires a Location currency", async () => {
    const organizationId = await createOrganization();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO locations (
           id, organization_id, name, code, address_text,
           timezone, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          organizationId,
          "Missing Currency",
          `CUR-${randomUUID()}`,
          "Amman",
          "Asia/Amman",
        ],
      ),
      "currency",
    );
  });

  it("rejects a non-uppercase ISO-style Location currency", async () => {
    const organizationId = await createOrganization();

    await expectPostgresError(
      databaseClient.query(
        `INSERT INTO locations (
           id, organization_id, name, code, address_text,
           timezone, currency, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          organizationId,
          "Invalid Currency",
          `CUR-${randomUUID()}`,
          "Amman",
          "Asia/Amman",
          "jod",
        ],
      ),
      "23514",
      "locations_currency_format_check",
    );
  });

  it("rejects duplicate membership-location access", async () => {
    const tenant = await createTenant();
    const staff = await createStaff(tenant.organizationId);
    const values = [
      tenant.organizationId,
      staff.membershipId,
      tenant.locationId,
    ];
    const insert = () =>
      databaseClient.query(
        `INSERT INTO membership_location_access (
           organization_id, membership_id, location_id
         ) VALUES ($1, $2, $3)`,
        values,
      );

    await insert();
    await expectPostgresError(
      insert(),
      "23505",
      "membership_location_access_pkey",
    );
  });

  it("rejects cross-organization membership-location access", async () => {
    const firstTenant = await createTenant();
    const secondTenant = await createTenant();
    const staff = await createStaff(firstTenant.organizationId);

    await expectPostgresError(
      databaseClient.query(
        `INSERT INTO membership_location_access (
           organization_id, membership_id, location_id
         ) VALUES ($1, $2, $3)`,
        [
          firstTenant.organizationId,
          staff.membershipId,
          secondTenant.locationId,
        ],
      ),
      "23503",
      "membership_location_access_organization_id_location_id_fkey",
    );
  });

  it("requires stored staff emails to be normalized and globally unique", async () => {
    const email = `${randomUUID()}@example.com`;
    await createUser(email);

    await expectPostgresError(createUser(email), "23505", "users_email_key");
    await expectPostgresError(
      createUser(` ${randomUUID()}@EXAMPLE.COM `),
      "23514",
      "users_email_normalized_check",
    );
  });

  it("rejects a shift ending before it starts", async () => {
    const tenant = await createTenant();
    const staff = await createStaff(tenant.organizationId);

    await expectPostgresError(
      insertShift(tenant, staff.membershipId, {
        endedAt: new Date("2026-08-08T16:59:59.999Z"),
        startedAt: new Date("2026-08-08T17:00:00.000Z"),
        status: "ENDED",
      }),
      "23514",
      "shifts_ended_at_check",
    );
  });

  it("rejects cross-organization shift membership", async () => {
    const firstTenant = await createTenant();
    const secondTenant = await createTenant();
    const firstStaff = await createStaff(firstTenant.organizationId);

    await expectPostgresError(
      insertShift(secondTenant, firstStaff.membershipId),
      "23503",
      "shifts_organization_id_membership_id_fkey",
    );
  });

  it("allows only one ACTIVE shift per membership", async () => {
    const tenant = await createTenant();
    const staff = await createStaff(tenant.organizationId);
    const firstShiftId = await insertShift(tenant, staff.membershipId);

    await expectPostgresError(
      insertShift(tenant, staff.membershipId),
      "23505",
      "shifts_one_active_per_membership_idx",
    );

    await databaseClient.query(
      `UPDATE shifts
       SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [firstShiftId],
    );
    await expect(insertShift(tenant, staff.membershipId)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("rejects undocumented shift status values", async () => {
    const tenant = await createTenant();
    const staff = await createStaff(tenant.organizationId);

    await expectPostgresError(
      insertShift(tenant, staff.membershipId, { status: "PAUSED" }),
      "22P02",
    );
  });

  it("restricts deletion of referenced organizations and users", async () => {
    const tenant = await createTenant();
    const staff = await createStaff(tenant.organizationId);

    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        tenant.organizationId,
      ]),
      "23503",
      "locations_organization_id_fkey",
    );
    await expectPostgresError(
      databaseClient.query("DELETE FROM users WHERE id = $1", [staff.userId]),
      "23503",
      "organization_memberships_user_id_fkey",
    );
  });
});

describe("customer and vehicle database foundation", () => {
  it("accepts a valid Customer", async () => {
    const organizationId = await createOrganization();
    const customerId = await createCustomer(
      organizationId,
      "+962790000001",
      "Guest One",
    );

    const result = await databaseClient.query<{
      display_name: string | null;
      phone_normalized: string;
    }>(
      `SELECT display_name, phone_normalized
       FROM customers
       WHERE id = $1`,
      [customerId],
    );
    expect(result.rows[0]).toEqual({
      display_name: "Guest One",
      phone_normalized: "+962790000001",
    });
  });

  it("requires Customer phone_normalized", async () => {
    const organizationId = await createOrganization();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO customers (id, organization_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [randomUUID(), organizationId],
      ),
      "phone_normalized",
    );
  });

  it("accepts a Customer with a null display_name", async () => {
    const organizationId = await createOrganization();
    const customerId = await createCustomer(organizationId);

    const result = await databaseClient.query<{
      display_name: string | null;
    }>("SELECT display_name FROM customers WHERE id = $1", [customerId]);
    expect(result.rows[0]?.display_name).toBeNull();
  });

  it("does not impose Customer phone uniqueness", async () => {
    const organizationId = await createOrganization();
    const phone = "+962790000002";

    await createCustomer(organizationId, phone);
    await expect(createCustomer(organizationId, phone)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("rejects a Customer for an unknown Organization", async () => {
    await expectPostgresError(
      createCustomer(randomUUID()),
      "23503",
      "customers_organization_id_fkey",
    );
  });

  it("restricts deletion of an Organization referenced by a Customer", async () => {
    const organizationId = await createOrganization();
    await createCustomer(organizationId);

    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        organizationId,
      ]),
      "23503",
      "customers_organization_id_fkey",
    );
  });

  it("accepts a valid known-plate Vehicle", async () => {
    const organizationId = await createOrganization();
    const vehicleId = await createVehicle(organizationId, {
      color: null,
      make: null,
      model: null,
      plateCountry: "JO",
      plateNumberNormalized: "1234567",
      plateNumberRaw: "12-34567",
    });

    const result = await databaseClient.query<{
      color: string | null;
      make: string | null;
      model: string | null;
      plate_country: string | null;
    }>(
      `SELECT color, make, model, plate_country
       FROM vehicles
       WHERE id = $1`,
      [vehicleId],
    );
    expect(result.rows[0]).toEqual({
      color: null,
      make: null,
      model: null,
      plate_country: "JO",
    });
  });

  it("rejects a partial Vehicle plate identity", async () => {
    const organizationId = await createOrganization();

    await expectPostgresError(
      createVehicle(organizationId, {
        plateCountry: "JO",
        plateNumberNormalized: "1234567",
        plateNumberRaw: null,
      }),
      "23514",
      "vehicles_plate_identity_all_or_none_check",
    );
  });

  it("rejects a lowercase Vehicle plate_country", async () => {
    const organizationId = await createOrganization();

    await expectPostgresError(
      createVehicle(organizationId, { plateCountry: "jo" }),
      "23514",
      "vehicles_plate_country_format_check",
    );
  });

  it("rejects a duplicate known plate in the same Organization", async () => {
    const organizationId = await createOrganization();
    const plate = {
      plateCountry: "JO",
      plateNumberNormalized: "7654321",
      plateNumberRaw: "76-54321",
    };
    await createVehicle(organizationId, plate);

    await expectPostgresError(
      createVehicle(organizationId, plate),
      "23505",
      "vehicles_known_plate_unique_idx",
    );
  });

  it("allows the same known plate in different Organizations", async () => {
    const firstOrganizationId = await createOrganization("First Operator");
    const secondOrganizationId = await createOrganization("Second Operator");
    const plate = {
      plateCountry: "JO",
      plateNumberNormalized: "1122334",
      plateNumberRaw: "11-22334",
    };
    await createVehicle(firstOrganizationId, plate);

    await expect(
      createVehicle(secondOrganizationId, plate),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts an unidentified Vehicle with a temporary descriptor", async () => {
    const organizationId = await createOrganization();

    await expect(
      createVehicle(organizationId, {
        plateCountry: null,
        plateNumberNormalized: null,
        plateNumberRaw: null,
        temporaryDescriptor: "Black SUV at lane 2",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects an unidentified Vehicle without a temporary descriptor", async () => {
    const organizationId = await createOrganization();

    await expectPostgresError(
      createVehicle(organizationId, {
        plateCountry: null,
        plateNumberNormalized: null,
        plateNumberRaw: null,
        temporaryDescriptor: null,
      }),
      "23514",
      "vehicles_temporary_descriptor_check",
    );
  });

  it("rejects blank or whitespace-padded Vehicle descriptors", async () => {
    const organizationId = await createOrganization();

    for (const temporaryDescriptor of ["", "   ", " Black SUV "]) {
      await expectPostgresError(
        createVehicle(organizationId, {
          plateCountry: null,
          plateNumberNormalized: null,
          plateNumberRaw: null,
          temporaryDescriptor,
        }),
        "23514",
        "vehicles_temporary_descriptor_check",
      );
    }
  });

  it("allows multiple unidentified Vehicles", async () => {
    const organizationId = await createOrganization();

    await createVehicle(organizationId, {
      plateCountry: null,
      plateNumberNormalized: null,
      plateNumberRaw: null,
      temporaryDescriptor: "Black sedan",
    });
    await expect(
      createVehicle(organizationId, {
        plateCountry: null,
        plateNumberNormalized: null,
        plateNumberRaw: null,
        temporaryDescriptor: "White SUV",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("allows duplicate temporary Vehicle descriptors", async () => {
    const organizationId = await createOrganization();
    const unidentifiedVehicle = {
      plateCountry: null,
      plateNumberNormalized: null,
      plateNumberRaw: null,
      temporaryDescriptor: "Black sedan",
    };
    await createVehicle(organizationId, unidentifiedVehicle);

    await expect(
      createVehicle(organizationId, unidentifiedVehicle),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects a Vehicle for an unknown Organization", async () => {
    await expectPostgresError(
      createVehicle(randomUUID()),
      "23503",
      "vehicles_organization_id_fkey",
    );
  });

  it("restricts deletion of an Organization referenced by a Vehicle", async () => {
    const organizationId = await createOrganization();
    await createVehicle(organizationId);

    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        organizationId,
      ]),
      "23503",
      "vehicles_organization_id_fkey",
    );
  });
});

describe("parking spot database foundation", () => {
  it("accepts a valid ParkingSpot", async () => {
    const tenant = await createTenant();
    const parkingSpotId = await createParkingSpot(tenant, {
      code: "A-01",
      label: "Garage A / 01",
    });

    const result = await databaseClient.query<{
      code: string;
      label: string;
    }>("SELECT code, label FROM parking_spots WHERE id = $1", [parkingSpotId]);
    expect(result.rows[0]).toEqual({ code: "A-01", label: "Garage A / 01" });
  });

  it("defaults ParkingSpot status to ACTIVE", async () => {
    const tenant = await createTenant();
    const parkingSpotId = await createParkingSpot(tenant);

    const result = await databaseClient.query<{ status: string }>(
      "SELECT status::text AS status FROM parking_spots WHERE id = $1",
      [parkingSpotId],
    );
    expect(result.rows[0]?.status).toBe("ACTIVE");
  });

  it("accepts an INACTIVE ParkingSpot", async () => {
    const tenant = await createTenant();
    const parkingSpotId = await createParkingSpot(tenant, {
      status: "INACTIVE",
    });

    const result = await databaseClient.query<{ status: string }>(
      "SELECT status::text AS status FROM parking_spots WHERE id = $1",
      [parkingSpotId],
    );
    expect(result.rows[0]?.status).toBe("INACTIVE");
  });

  it("rejects an undocumented ParkingSpot status", async () => {
    const tenant = await createTenant();

    await expectPostgresError(
      createParkingSpot(tenant, { status: "UNSUPPORTED" }),
      "22P02",
    );
  });

  it("requires ParkingSpot code and label", async () => {
    const tenant = await createTenant();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO parking_spots (
           id, organization_id, location_id, label, updated_at
         ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [randomUUID(), tenant.organizationId, tenant.locationId, "Spot"],
      ),
      "code",
    );
    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO parking_spots (
           id, organization_id, location_id, code, updated_at
         ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [randomUUID(), tenant.organizationId, tenant.locationId, "A-02"],
      ),
      "label",
    );
  });

  it("rejects duplicate ParkingSpot codes in one Location", async () => {
    const tenant = await createTenant();
    await createParkingSpot(tenant, { code: "A-03" });

    await expectPostgresError(
      createParkingSpot(tenant, { code: "A-03" }),
      "23505",
      "parking_spots_location_id_code_key",
    );
  });

  it("allows the same ParkingSpot code in different Locations", async () => {
    const organizationId = await createOrganization();
    const firstLocationId = await createLocation(organizationId, "FIRST");
    const secondLocationId = await createLocation(organizationId, "SECOND");
    await createParkingSpot(
      { locationId: firstLocationId, organizationId },
      { code: "A-04" },
    );

    await expect(
      createParkingSpot(
        { locationId: secondLocationId, organizationId },
        { code: "A-04" },
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects a ParkingSpot for an unknown Organization", async () => {
    const tenant = await createTenant();

    await expectPostgresError(
      createParkingSpot({ ...tenant, organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects a ParkingSpot for an unknown Location", async () => {
    const organizationId = await createOrganization();

    await expectPostgresError(
      createParkingSpot({ locationId: randomUUID(), organizationId }),
      "23503",
      "parking_spots_organization_id_location_id_fkey",
    );
  });

  it("rejects a cross-Organization ParkingSpot Location", async () => {
    const firstTenant = await createTenant();
    const secondTenant = await createTenant();

    await expectPostgresError(
      createParkingSpot({
        locationId: secondTenant.locationId,
        organizationId: firstTenant.organizationId,
      }),
      "23503",
      "parking_spots_organization_id_location_id_fkey",
    );
  });

  it("restricts deletion of a referenced ParkingSpot Location and Organization", async () => {
    const tenant = await createTenant();
    await createParkingSpot(tenant);

    await expectPostgresError(
      databaseClient.query("DELETE FROM locations WHERE id = $1", [
        tenant.locationId,
      ]),
      "23503",
      "parking_spots_organization_id_location_id_fkey",
    );
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        tenant.organizationId,
      ]),
      "23503",
    );
  });
});

describe("key slot database foundation", () => {
  it("accepts a valid KeySlot", async () => {
    const tenant = await createTenant();
    const keySlotId = await createKeySlot(tenant, { code: "K-01" });

    const result = await databaseClient.query<{ code: string }>(
      "SELECT code FROM key_slots WHERE id = $1",
      [keySlotId],
    );
    expect(result.rows[0]?.code).toBe("K-01");
  });

  it("defaults KeySlot status to ACTIVE", async () => {
    const tenant = await createTenant();
    const keySlotId = await createKeySlot(tenant);

    const result = await databaseClient.query<{ status: string }>(
      "SELECT status::text AS status FROM key_slots WHERE id = $1",
      [keySlotId],
    );
    expect(result.rows[0]?.status).toBe("ACTIVE");
  });

  it("accepts an INACTIVE KeySlot", async () => {
    const tenant = await createTenant();
    const keySlotId = await createKeySlot(tenant, { status: "INACTIVE" });

    const result = await databaseClient.query<{ status: string }>(
      "SELECT status::text AS status FROM key_slots WHERE id = $1",
      [keySlotId],
    );
    expect(result.rows[0]?.status).toBe("INACTIVE");
  });

  it("rejects an undocumented KeySlot status", async () => {
    const tenant = await createTenant();

    await expectPostgresError(
      createKeySlot(tenant, { status: "UNSUPPORTED" }),
      "22P02",
    );
  });

  it("requires a KeySlot code", async () => {
    const tenant = await createTenant();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO key_slots (
           id, organization_id, location_id, updated_at
         ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [randomUUID(), tenant.organizationId, tenant.locationId],
      ),
      "code",
    );
  });

  it("rejects duplicate KeySlot codes in one Location", async () => {
    const tenant = await createTenant();
    await createKeySlot(tenant, { code: "K-02" });

    await expectPostgresError(
      createKeySlot(tenant, { code: "K-02" }),
      "23505",
      "key_slots_location_id_code_key",
    );
  });

  it("allows the same KeySlot code in different Locations", async () => {
    const organizationId = await createOrganization();
    const firstLocationId = await createLocation(organizationId, "FIRST");
    const secondLocationId = await createLocation(organizationId, "SECOND");
    await createKeySlot(
      { locationId: firstLocationId, organizationId },
      { code: "K-03" },
    );

    await expect(
      createKeySlot(
        { locationId: secondLocationId, organizationId },
        { code: "K-03" },
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects a KeySlot for an unknown Organization", async () => {
    const tenant = await createTenant();

    await expectPostgresError(
      createKeySlot({ ...tenant, organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects a KeySlot for an unknown Location", async () => {
    const organizationId = await createOrganization();

    await expectPostgresError(
      createKeySlot({ locationId: randomUUID(), organizationId }),
      "23503",
      "key_slots_organization_id_location_id_fkey",
    );
  });

  it("rejects a cross-Organization KeySlot Location", async () => {
    const firstTenant = await createTenant();
    const secondTenant = await createTenant();

    await expectPostgresError(
      createKeySlot({
        locationId: secondTenant.locationId,
        organizationId: firstTenant.organizationId,
      }),
      "23503",
      "key_slots_organization_id_location_id_fkey",
    );
  });

  it("restricts deletion of a referenced KeySlot Location and Organization", async () => {
    const tenant = await createTenant();
    await createKeySlot(tenant);

    await expectPostgresError(
      databaseClient.query("DELETE FROM locations WHERE id = $1", [
        tenant.locationId,
      ]),
      "23503",
      "key_slots_organization_id_location_id_fkey",
    );
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        tenant.organizationId,
      ]),
      "23503",
    );
  });
});

describe("valet session database foundation", () => {
  const documentedStates = [
    "CHECKING_IN",
    "AWAITING_PARKING",
    "PARKING",
    "PARKED",
    "REQUESTED",
    "RETRIEVING",
    "READY",
    "HANDOFF_PENDING",
    "COMPLETED",
  ];

  it("accepts a valid minimal CHECKING_IN session", async () => {
    const fixture = await createValetSessionFixture();
    const sessionId = await createValetSession(fixture);

    const result = await databaseClient.query<{
      customer_access_token_hash: string;
      state: string;
    }>(
      `SELECT customer_access_token_hash, state::text AS state
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(result.rows[0]).toEqual({
      customer_access_token_hash: expect.stringMatching(/^sha256:[a-f0-9]+$/),
      state: "CHECKING_IN",
    });
  });

  it("accepts all nine documented ValetSession states", async () => {
    for (const state of documentedStates) {
      const fixture = await createValetSessionFixture();
      await expect(
        createValetSession(fixture, {
          completedAt: state === "COMPLETED" ? new Date() : null,
          state,
        }),
      ).resolves.toBeTypeOf("string");
    }
  });

  it("rejects an undocumented ValetSession state", async () => {
    const fixture = await createValetSessionFixture();

    await expectPostgresError(
      createValetSession(fixture, { state: "UNSUPPORTED" }),
      "22P02",
    );
  });

  it("allows all documented nullable relationship fields", async () => {
    const fixture = await createValetSessionFixture();
    const sessionId = await createValetSession(fixture);

    const result = await databaseClient.query<{
      completed_by_membership_id: string | null;
      current_assignee_membership_id: string | null;
      customer_id: string | null;
      key_slot_id: string | null;
      parking_spot_id: string | null;
    }>(
      `SELECT customer_id, parking_spot_id, key_slot_id,
              current_assignee_membership_id, completed_by_membership_id
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    expect(result.rows[0]).toEqual({
      completed_by_membership_id: null,
      current_assignee_membership_id: null,
      customer_id: null,
      key_slot_id: null,
      parking_spot_id: null,
    });
  });

  it("rejects a duplicate customer access token hash", async () => {
    const tokenHash = `sha256:${randomUUID().replaceAll("-", "")}`;
    await createValetSession(await createValetSessionFixture(), {
      customerAccessTokenHash: tokenHash,
    });

    await expectPostgresError(
      createValetSession(await createValetSessionFixture(), {
        customerAccessTokenHash: tokenHash,
      }),
      "23505",
      "valet_sessions_customer_access_token_hash_key",
    );
  });

  it("requires customer access expiration", async () => {
    const fixture = await createValetSessionFixture();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO valet_sessions (
           id, customer_access_token_hash, organization_id, location_id,
           vehicle_id, state, checked_in_by_membership_id, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          `sha256:${randomUUID().replaceAll("-", "")}`,
          fixture.organizationId,
          fixture.locationId,
          fixture.vehicleId,
          "CHECKING_IN",
          fixture.checkedInByMembershipId,
        ],
      ),
      "customer_access_expires_at",
    );
  });

  it("requires an explicit state without a database default", async () => {
    const fixture = await createValetSessionFixture();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO valet_sessions (
           id, customer_access_token_hash, customer_access_expires_at,
           organization_id, location_id, vehicle_id,
           checked_in_by_membership_id, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [
          randomUUID(),
          `sha256:${randomUUID().replaceAll("-", "")}`,
          new Date(Date.now() + 60 * 60 * 1_000),
          fixture.organizationId,
          fixture.locationId,
          fixture.vehicleId,
          fixture.checkedInByMembershipId,
        ],
      ),
      "state",
    );
  });

  it("defaults version to 1", async () => {
    const sessionId = await createValetSession(
      await createValetSessionFixture(),
    );

    const result = await databaseClient.query<{ version: number }>(
      "SELECT version FROM valet_sessions WHERE id = $1",
      [sessionId],
    );
    expect(result.rows[0]?.version).toBe(1);
  });

  it("rejects version values below 1", async () => {
    await expectPostgresError(
      createValetSession(await createValetSessionFixture(), { version: 0 }),
      "23514",
      "valet_sessions_version_check",
    );
  });

  it("rejects COMPLETED without completed_at", async () => {
    await expectPostgresError(
      createValetSession(await createValetSessionFixture(), {
        state: "COMPLETED",
      }),
      "23514",
      "valet_sessions_completed_at_check",
    );
  });

  it("accepts COMPLETED with completed_at", async () => {
    await expect(
      createValetSession(await createValetSessionFixture(), {
        completedAt: new Date(),
        state: "COMPLETED",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects an unknown Organization", async () => {
    const fixture = await createValetSessionFixture();

    await expectPostgresError(
      createValetSession(fixture, { organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects a Location from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();

    await expectPostgresError(
      createValetSession({ ...fixture, locationId: otherTenant.locationId }),
      "23503",
      "valet_sessions_org_location_id_fkey",
    );
  });

  it("rejects a Vehicle from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherVehicleId = await createVehicle(otherTenant.organizationId);

    await expectPostgresError(
      createValetSession({ ...fixture, vehicleId: otherVehicleId }),
      "23503",
      "valet_sessions_org_vehicle_id_fkey",
    );
  });

  it("rejects a Customer from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherCustomerId = await createCustomer(otherTenant.organizationId);

    await expectPostgresError(
      createValetSession(fixture, { customerId: otherCustomerId }),
      "23503",
      "valet_sessions_org_customer_id_fkey",
    );
  });

  it("rejects checked-in-by membership from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherStaff = await createStaff(otherTenant.organizationId);

    await expectPostgresError(
      createValetSession({
        ...fixture,
        checkedInByMembershipId: otherStaff.membershipId,
      }),
      "23503",
      "valet_sessions_org_checked_in_by_id_fkey",
    );
  });

  it("rejects current-assignee membership from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherStaff = await createStaff(otherTenant.organizationId);

    await expectPostgresError(
      createValetSession(fixture, {
        currentAssigneeMembershipId: otherStaff.membershipId,
      }),
      "23503",
      "valet_sessions_org_current_assignee_id_fkey",
    );
  });

  it("rejects completed-by membership from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherStaff = await createStaff(otherTenant.organizationId);

    await expectPostgresError(
      createValetSession(fixture, {
        completedByMembershipId: otherStaff.membershipId,
      }),
      "23503",
      "valet_sessions_org_completed_by_id_fkey",
    );
  });

  it("rejects a ParkingSpot from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherParkingSpotId = await createParkingSpot(otherTenant);

    await expectPostgresError(
      createValetSession(fixture, { parkingSpotId: otherParkingSpotId }),
      "23503",
      "valet_sessions_org_location_parking_zone_id_fkey",
    );
  });

  it("rejects a ParkingSpot from another Location in the same Organization", async () => {
    const tenant = await createTenant();
    const fixture = await createValetSessionFixture(tenant);
    const otherLocationId = await createLocation(tenant.organizationId);
    const otherParkingSpotId = await createParkingSpot({
      locationId: otherLocationId,
      organizationId: tenant.organizationId,
    });

    await expectPostgresError(
      createValetSession(fixture, { parkingSpotId: otherParkingSpotId }),
      "23503",
      "valet_sessions_org_location_parking_zone_id_fkey",
    );
  });

  it("rejects a KeySlot from another Organization", async () => {
    const fixture = await createValetSessionFixture();
    const otherTenant = await createTenant();
    const otherKeySlotId = await createKeySlot(otherTenant);

    await expectPostgresError(
      createValetSession(fixture, { keySlotId: otherKeySlotId }),
      "23503",
      "valet_sessions_org_location_key_slot_id_fkey",
    );
  });

  it("rejects a KeySlot from another Location in the same Organization", async () => {
    const tenant = await createTenant();
    const fixture = await createValetSessionFixture(tenant);
    const otherLocationId = await createLocation(tenant.organizationId);
    const otherKeySlotId = await createKeySlot({
      locationId: otherLocationId,
      organizationId: tenant.organizationId,
    });

    await expectPostgresError(
      createValetSession(fixture, { keySlotId: otherKeySlotId }),
      "23503",
      "valet_sessions_org_location_key_slot_id_fkey",
    );
  });

  it("restricts deletion of every referenced operational resource", async () => {
    const tenant = await createTenant();
    const fixture = await createValetSessionFixture(tenant);
    const customerId = await createCustomer(tenant.organizationId);
    const parkingSpotId = await createParkingSpot(tenant);
    const keySlotId = await createKeySlot(tenant);
    const currentAssignee = await createStaff(tenant.organizationId);
    const completedBy = await createStaff(tenant.organizationId);
    await createValetSession(fixture, {
      completedByMembershipId: completedBy.membershipId,
      currentAssigneeMembershipId: currentAssignee.membershipId,
      customerId,
      keySlotId,
      parkingSpotId,
    });

    const deletions: Array<[string, string, string?]> = [
      [
        "DELETE FROM vehicles WHERE id = $1",
        fixture.vehicleId,
        "valet_sessions_org_vehicle_id_fkey",
      ],
      [
        "DELETE FROM customers WHERE id = $1",
        customerId,
        "valet_sessions_org_customer_id_fkey",
      ],
      [
        "DELETE FROM organization_memberships WHERE id = $1",
        fixture.checkedInByMembershipId,
        "valet_sessions_org_checked_in_by_id_fkey",
      ],
      [
        "DELETE FROM organization_memberships WHERE id = $1",
        currentAssignee.membershipId,
        "valet_sessions_org_current_assignee_id_fkey",
      ],
      [
        "DELETE FROM organization_memberships WHERE id = $1",
        completedBy.membershipId,
        "valet_sessions_org_completed_by_id_fkey",
      ],
      [
        "DELETE FROM parking_spots WHERE id = $1",
        parkingSpotId,
        "valet_sessions_org_location_zone_parking_spot_id_fkey",
      ],
      [
        "DELETE FROM key_slots WHERE id = $1",
        keySlotId,
        "valet_sessions_org_location_key_slot_id_fkey",
      ],
    ];

    for (const [query, id, constraint] of deletions) {
      await expectPostgresError(
        databaseClient.query(query, [id]),
        "23503",
        constraint,
      );
    }
    await expectPostgresError(
      databaseClient.query("DELETE FROM locations WHERE id = $1", [
        tenant.locationId,
      ]),
      "23503",
    );
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        tenant.organizationId,
      ]),
      "23503",
    );
  });

  it("rejects a second active session for the same Location and Vehicle", async () => {
    const fixture = await createValetSessionFixture();
    await createValetSession(fixture, { state: "PARKED" });

    await expectPostgresError(
      createValetSession(fixture, { state: "REQUESTED" }),
      "23505",
      "valet_sessions_active_location_vehicle_key",
    );
  });

  it("allows one Vehicle to have active sessions at different Locations", async () => {
    const tenant = await createTenant();
    const fixture = await createValetSessionFixture(tenant);
    const otherLocationId = await createLocation(tenant.organizationId);
    await createValetSession(fixture, { state: "PARKED" });

    await expect(
      createValetSession(
        { ...fixture, locationId: otherLocationId },
        { state: "REQUESTED" },
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("allows a later active session after completion for the same Location and Vehicle", async () => {
    const fixture = await createValetSessionFixture();
    await createValetSession(fixture, {
      completedAt: new Date(),
      state: "COMPLETED",
    });

    await expect(createValetSession(fixture)).resolves.toBeTypeOf("string");
  });

  it("rejects a second active session using the same ParkingSpot", async () => {
    const tenant = await createTenant();
    const parkingSpotId = await createParkingSpot(tenant);
    await createValetSession(await createValetSessionFixture(tenant), {
      parkingSpotId,
      state: "PARKED",
    });

    await expectPostgresError(
      createValetSession(await createValetSessionFixture(tenant), {
        parkingSpotId,
        state: "PARKING",
      }),
      "23505",
      "valet_sessions_parking_spot_id_key",
    );
  });

  it("reserves ParkingSpot occupancy until the current assignment is cleared", async () => {
    const tenant = await createTenant();
    const parkingSpotId = await createParkingSpot(tenant);
    await createValetSession(await createValetSessionFixture(tenant), {
      completedAt: new Date(),
      parkingSpotId,
      state: "COMPLETED",
    });

    await expectPostgresError(
      createValetSession(await createValetSessionFixture(tenant), {
        parkingSpotId,
        state: "PARKING",
      }),
      "23505",
      "valet_sessions_parking_spot_id_key",
    );
  });

  it("rejects a second active session using the same KeySlot", async () => {
    const tenant = await createTenant();
    const keySlotId = await createKeySlot(tenant);
    await createValetSession(await createValetSessionFixture(tenant), {
      keySlotId,
      state: "PARKED",
    });

    await expectPostgresError(
      createValetSession(await createValetSessionFixture(tenant), {
        keySlotId,
        state: "RETRIEVING",
      }),
      "23505",
      "valet_sessions_key_slot_id_key",
    );
  });

  it("reserves KeySlot occupancy until the current assignment is cleared", async () => {
    const tenant = await createTenant();
    const keySlotId = await createKeySlot(tenant);
    await createValetSession(await createValetSessionFixture(tenant), {
      completedAt: new Date(),
      keySlotId,
      state: "COMPLETED",
    });

    await expectPostgresError(
      createValetSession(await createValetSessionFixture(tenant), {
        keySlotId,
        state: "CHECKING_IN",
      }),
      "23505",
      "valet_sessions_key_slot_id_key",
    );
  });
});

describe("audit event database foundation", () => {
  it("accepts a valid AuditEvent without a session or membership actor", async () => {
    const tenant = await createTenant();
    const entityId = randomUUID();
    const auditEventId = await createAuditEvent(tenant, { entityId });

    const result = await databaseClient.query<{
      actor_membership_id: string | null;
      entity_id: string;
      actor_type: string;
      valet_session_id: string | null;
    }>(
      `SELECT actor_membership_id, actor_type::text, entity_id, valet_session_id
       FROM audit_events WHERE id = $1`,
      [auditEventId],
    );
    expect(result.rows[0]).toEqual({
      actor_membership_id: null,
      actor_type: "SYSTEM",
      entity_id: entityId,
      valet_session_id: null,
    });
  });

  it("accepts a valid AuditEvent with a session and actor", async () => {
    const tenant = await createTenant();
    const fixture = await createValetSessionFixture(tenant);
    const valetSessionId = await createValetSession(fixture);
    const auditEventId = await createAuditEvent(tenant, {
      actorMembershipId: fixture.checkedInByMembershipId,
      valetSessionId,
    });

    const result = await databaseClient.query<{
      actor_membership_id: string;
      valet_session_id: string;
    }>(
      `SELECT actor_membership_id, valet_session_id
       FROM audit_events WHERE id = $1`,
      [auditEventId],
    );
    expect(result.rows[0]).toEqual({
      actor_membership_id: fixture.checkedInByMembershipId,
      valet_session_id: valetSessionId,
    });
  });

  it("enforces every required AuditEvent field", async () => {
    const tenant = await createTenant();
    const requiredColumns = [
      "id",
      "organization_id",
      "event_type",
      "entity_type",
      "entity_id",
      "metadata_json",
      "occurred_at",
    ];

    for (const [missingIndex, missingColumn] of requiredColumns.entries()) {
      const values: unknown[] = [
        randomUUID(),
        tenant.organizationId,
        "vehicle.recorded",
        "Vehicle",
        randomUUID(),
        { source: "integrity-test" },
        new Date(),
      ];
      values[missingIndex] = null;

      await expectNotNullViolation(
        databaseClient.query(
          `INSERT INTO audit_events (
             id, organization_id, actor_type, event_type,
             entity_type, entity_id, metadata_json, occurred_at
           ) VALUES ($1, $2, 'SYSTEM', $3, $4, $5, $6, $7)`,
          values,
        ),
        missingColumn,
      );
    }
  });

  it("stores metadata_json as structured JSONB", async () => {
    const tenant = await createTenant();
    const metadataJson = {
      context: { channel: "employee-terminal", sequence: 2 },
      tags: ["custody", "intake"],
    };
    const auditEventId = await createAuditEvent(tenant, { metadataJson });

    const result = await databaseClient.query<{
      data_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT metadata_json, pg_typeof(metadata_json)::text AS data_type
       FROM audit_events WHERE id = $1`,
      [auditEventId],
    );
    expect(result.rows[0]).toEqual({
      data_type: "jsonb",
      metadata_json: metadataJson,
    });
  });

  it("accepts a null idempotency_key", async () => {
    const tenant = await createTenant();
    const auditEventId = await createAuditEvent(tenant);

    const result = await databaseClient.query<{
      idempotency_key: string | null;
    }>("SELECT idempotency_key FROM audit_events WHERE id = $1", [
      auditEventId,
    ]);
    expect(result.rows[0]?.idempotency_key).toBeNull();
  });

  it("allows duplicate non-null idempotency_key values", async () => {
    const tenant = await createTenant();
    const idempotencyKey = `operation-${randomUUID()}`;
    await createAuditEvent(tenant, { idempotencyKey });

    await expect(
      createAuditEvent(tenant, { idempotencyKey }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects an unknown Organization", async () => {
    const tenant = await createTenant();

    await expectPostgresError(
      createAuditEvent(tenant, { organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects a Location from another Organization", async () => {
    const firstTenant = await createTenant();
    const secondTenant = await createTenant();

    await expectPostgresError(
      createAuditEvent({
        locationId: secondTenant.locationId,
        organizationId: firstTenant.organizationId,
      }),
      "23503",
      "audit_events_org_location_id_fkey",
    );
  });

  it("rejects an actor membership from another Organization", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const otherStaff = await createStaff(otherTenant.organizationId);

    await expectPostgresError(
      createAuditEvent(tenant, {
        actorMembershipId: otherStaff.membershipId,
      }),
      "23503",
      "audit_events_org_actor_membership_id_fkey",
    );
  });

  it("rejects a ValetSession from another Organization", async () => {
    const tenant = await createTenant();
    const otherFixture = await createValetSessionFixture();
    const otherValetSessionId = await createValetSession(otherFixture);

    await expectPostgresError(
      createAuditEvent(tenant, { valetSessionId: otherValetSessionId }),
      "23503",
      "audit_events_org_location_valet_session_id_fkey",
    );
  });

  it("rejects a ValetSession from another Location in the same Organization", async () => {
    const organizationId = await createOrganization();
    const firstLocationId = await createLocation(organizationId, "FIRST");
    const secondLocationId = await createLocation(organizationId, "SECOND");
    const secondFixture = await createValetSessionFixture({
      locationId: secondLocationId,
      organizationId,
    });
    const secondLocationSessionId = await createValetSession(secondFixture);

    await expectPostgresError(
      createAuditEvent(
        { locationId: firstLocationId, organizationId },
        { valetSessionId: secondLocationSessionId },
      ),
      "23503",
      "audit_events_org_location_valet_session_id_fkey",
    );
  });

  it("restricts deletion of referenced Organization, Location, session, and membership", async () => {
    const tenant = await createTenant();
    await createAuditEvent(tenant);

    await expectPostgresError(
      databaseClient.query("DELETE FROM locations WHERE id = $1", [
        tenant.locationId,
      ]),
      "23503",
      "audit_events_org_location_id_fkey",
    );
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        tenant.organizationId,
      ]),
      "23503",
    );

    const sessionTenant = await createTenant();
    const fixture = await createValetSessionFixture(sessionTenant);
    const valetSessionId = await createValetSession(fixture);
    const actor = await createStaff(sessionTenant.organizationId);
    await createAuditEvent(sessionTenant, {
      actorMembershipId: actor.membershipId,
      valetSessionId,
    });

    await expectPostgresError(
      databaseClient.query("DELETE FROM valet_sessions WHERE id = $1", [
        valetSessionId,
      ]),
      "23503",
      "audit_events_org_location_valet_session_id_fkey",
    );
    await expectPostgresError(
      databaseClient.query(
        "DELETE FROM organization_memberships WHERE id = $1",
        [actor.membershipId],
      ),
      "23503",
      "audit_events_org_actor_membership_id_fkey",
    );
  });

  it("creates exactly the required session timeline index shape", async () => {
    const definition = await databaseClient.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'audit_events'
         AND indexname = 'audit_events_valet_session_id_occurred_at_idx'`,
    );
    expect(definition.rows).toHaveLength(1);
    expect(definition.rows[0]?.indexdef).toContain(
      "USING btree (valet_session_id, occurred_at)",
    );

    const columns = await databaseClient.query<{
      column_name: string;
      column_position: string;
      direction: string;
    }>(
      `SELECT a.attname AS column_name,
              k.ordinality::text AS column_position,
              CASE WHEN (i.indoption[k.ordinality - 1] & 1) = 1
                   THEN 'DESC' ELSE 'ASC' END AS direction
       FROM pg_index i
       JOIN pg_class ci ON ci.oid = i.indexrelid
       JOIN pg_class ct ON ct.oid = i.indrelid
       CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
       JOIN pg_attribute a ON a.attrelid = ct.oid AND a.attnum = k.attnum
       WHERE ci.relname = 'audit_events_valet_session_id_occurred_at_idx'
       ORDER BY k.ordinality`,
    );
    expect(columns.rows).toEqual([
      {
        column_name: "valet_session_id",
        column_position: "1",
        direction: "ASC",
      },
      { column_name: "occurred_at", column_position: "2", direction: "ASC" },
    ]);
  });
});

describe("retrieval request database foundation", () => {
  it("keeps the first eight forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 8)).toEqual(
      expectedMigrationDirectories.slice(0, 8),
    );
  });

  it("accepts a valid CUSTOMER request", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const requestedAt = new Date("2026-08-09T09:10:11.123Z");
    const requestId = await createRetrievalRequest(fixture, {
      requestedAt,
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
    });

    const result = await databaseClient.query<{
      cancelled_at: Date | null;
      created_at: Date;
      requested_at: Date;
      requested_by_customer_id: string;
      requested_by_membership_id: string | null;
      requested_by_type: string;
      status: string;
    }>(
      `SELECT requested_by_type::text AS requested_by_type,
              requested_by_customer_id, requested_by_membership_id,
              status::text AS status, requested_at, cancelled_at, created_at
       FROM retrieval_requests WHERE id = $1`,
      [requestId],
    );
    expect(result.rows[0]).toEqual({
      cancelled_at: null,
      created_at: expect.any(Date),
      requested_at: requestedAt,
      requested_by_customer_id: fixture.customerId,
      requested_by_membership_id: null,
      requested_by_type: "CUSTOMER",
      status: "OPEN",
    });
  });

  it("accepts a valid STAFF request", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const requestId = await createRetrievalRequest(fixture, {
      requestedByMembershipId: fixture.membershipId,
      requestedByType: "STAFF",
    });

    const result = await databaseClient.query<{
      requested_by_customer_id: string | null;
      requested_by_membership_id: string;
      requested_by_type: string;
    }>(
      `SELECT requested_by_type::text AS requested_by_type,
              requested_by_customer_id, requested_by_membership_id
       FROM retrieval_requests WHERE id = $1`,
      [requestId],
    );
    expect(result.rows[0]).toEqual({
      requested_by_customer_id: null,
      requested_by_membership_id: fixture.membershipId,
      requested_by_type: "STAFF",
    });
  });

  it("accepts CUSTOMER with no customer requester", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expect(
      createRetrievalRequest(fixture, { requestedByType: "CUSTOMER" }),
    ).resolves.toEqual(expect.any(String));
  });

  it("rejects CUSTOMER with only a staff requester", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByMembershipId: fixture.membershipId,
        requestedByType: "CUSTOMER",
      }),
      "23514",
      "retrieval_requests_requester_consistency_check",
    );
  });

  it("rejects CUSTOMER with both requester fields", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByCustomerId: fixture.customerId,
        requestedByMembershipId: fixture.membershipId,
        requestedByType: "CUSTOMER",
      }),
      "23514",
      "retrieval_requests_requester_consistency_check",
    );
  });

  it("rejects STAFF with no staff requester", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, { requestedByType: "STAFF" }),
      "23514",
      "retrieval_requests_requester_consistency_check",
    );
  });

  it("rejects STAFF with only a customer requester", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByCustomerId: fixture.customerId,
        requestedByType: "STAFF",
      }),
      "23514",
      "retrieval_requests_requester_consistency_check",
    );
  });

  it("rejects STAFF with both requester fields", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByCustomerId: fixture.customerId,
        requestedByMembershipId: fixture.membershipId,
        requestedByType: "STAFF",
      }),
      "23514",
      "retrieval_requests_requester_consistency_check",
    );
  });

  it("rejects an unknown Organization", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        organizationId: randomUUID(),
        requestedByCustomerId: fixture.customerId,
        requestedByType: "CUSTOMER",
      }),
      "23503",
    );
  });

  it("rejects a ValetSession from another Organization", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const otherFixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(
        {
          organizationId: fixture.organizationId,
          valetSessionId: otherFixture.valetSessionId,
        },
        {
          requestedByCustomerId: fixture.customerId,
          requestedByType: "CUSTOMER",
        },
      ),
      "23503",
      "retrieval_requests_org_valet_session_id_fkey",
    );
  });

  it("rejects a Customer from another Organization", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const otherFixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByCustomerId: otherFixture.customerId,
        requestedByType: "CUSTOMER",
      }),
      "23503",
      "retrieval_requests_org_requested_by_customer_id_fkey",
    );
  });

  it("rejects an OrganizationMembership from another Organization", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const otherFixture = await createRetrievalRequestTestFixture();

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByMembershipId: otherFixture.membershipId,
        requestedByType: "STAFF",
      }),
      "23503",
      "retrieval_requests_org_requested_by_membership_id_fkey",
    );
  });

  it("uses RESTRICT for every RetrievalRequest foreign key and blocks Organization deletion", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
    });

    const foreignKeys = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'retrieval_requests'::regclass
         AND contype = 'f'
       ORDER BY conname`,
    );
    expect(foreignKeys.rows).toEqual([
      {
        confdeltype: "r",
        conname: "retrieval_requests_org_requested_by_customer_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "retrieval_requests_org_requested_by_membership_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "retrieval_requests_org_valet_session_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "retrieval_requests_organization_id_fkey",
      },
    ]);
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        fixture.organizationId,
      ]),
      "23503",
    );
  });

  it("restricts deletion of a referenced ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
    });

    await expectPostgresError(
      databaseClient.query("DELETE FROM valet_sessions WHERE id = $1", [
        fixture.valetSessionId,
      ]),
      "23503",
      "retrieval_requests_org_valet_session_id_fkey",
    );
  });

  it("restricts deletion of a referenced Customer", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
    });

    await expectPostgresError(
      databaseClient.query("DELETE FROM customers WHERE id = $1", [
        fixture.customerId,
      ]),
      "23503",
      "retrieval_requests_org_requested_by_customer_id_fkey",
    );
  });

  it("restricts deletion of a referenced OrganizationMembership", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      requestedByMembershipId: fixture.membershipId,
      requestedByType: "STAFF",
    });

    await expectPostgresError(
      databaseClient.query(
        "DELETE FROM organization_memberships WHERE id = $1",
        [fixture.membershipId],
      ),
      "23503",
      "retrieval_requests_org_requested_by_membership_id_fkey",
    );
  });

  it("accepts the first OPEN request for a ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expect(
      createRetrievalRequest(fixture, {
        requestedByCustomerId: fixture.customerId,
        requestedByType: "CUSTOMER",
        status: "OPEN",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects a second OPEN request for the same ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const values = {
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
      status: "OPEN",
    };
    await createRetrievalRequest(fixture, values);

    await expectPostgresError(
      createRetrievalRequest(fixture, values),
      "23505",
      "retrieval_requests_one_active_per_valet_session_idx",
    );
  });

  it("rejects OPEN plus ACCEPTED for the same ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
      status: "OPEN",
    });

    await expectPostgresError(
      createRetrievalRequest(fixture, {
        requestedByMembershipId: fixture.membershipId,
        requestedByType: "STAFF",
        status: "ACCEPTED",
      }),
      "23505",
      "retrieval_requests_one_active_per_valet_session_idx",
    );
  });

  it("rejects ACCEPTED plus ACCEPTED for the same ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const values = {
      requestedByMembershipId: fixture.membershipId,
      requestedByType: "STAFF",
      status: "ACCEPTED",
    };
    await createRetrievalRequest(fixture, values);

    await expectPostgresError(
      createRetrievalRequest(fixture, values),
      "23505",
      "retrieval_requests_one_active_per_valet_session_idx",
    );
  });

  it("allows an active request after a CANCELLED request", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      cancelledAt: new Date(),
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
      status: "CANCELLED",
    });

    await expect(
      createRetrievalRequest(fixture, {
        requestedByMembershipId: fixture.membershipId,
        requestedByType: "STAFF",
        status: "OPEN",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("allows an active request after a COMPLETED request", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    await createRetrievalRequest(fixture, {
      requestedByMembershipId: fixture.membershipId,
      requestedByType: "STAFF",
      status: "COMPLETED",
    });

    await expect(
      createRetrievalRequest(fixture, {
        requestedByCustomerId: fixture.customerId,
        requestedByType: "CUSTOMER",
        status: "ACCEPTED",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("allows multiple historical CANCELLED requests for one ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const values = {
      cancelledAt: new Date(),
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
      status: "CANCELLED",
    };
    await createRetrievalRequest(fixture, values);

    await expect(createRetrievalRequest(fixture, values)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("allows multiple historical COMPLETED requests for one ValetSession", async () => {
    const fixture = await createRetrievalRequestTestFixture();
    const values = {
      requestedByMembershipId: fixture.membershipId,
      requestedByType: "STAFF",
      status: "COMPLETED",
    };
    await createRetrievalRequest(fixture, values);

    await expect(createRetrievalRequest(fixture, values)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("defines exactly the documented PostgreSQL requester enum values", async () => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'retrieval_requester_type'
       ORDER BY e.enumsortorder`,
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual([
      "CUSTOMER",
      "STAFF",
    ]);
  });

  it("defines exactly the documented PostgreSQL status enum values", async () => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'retrieval_request_status'
       ORDER BY e.enumsortorder`,
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual([
      "OPEN",
      "ACCEPTED",
      "CANCELLED",
      "COMPLETED",
    ]);
  });

  it("creates the active-request index as a partial UNIQUE index", async () => {
    const result = await databaseClient.query<{
      has_predicate: boolean;
      indisunique: boolean;
    }>(
      `SELECT i.indisunique, i.indpred IS NOT NULL AS has_predicate
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       WHERE c.relname = 'retrieval_requests_one_active_per_valet_session_idx'`,
    );
    expect(result.rows).toEqual([{ has_predicate: true, indisunique: true }]);
  });

  it("uses exactly valet_session_id with the OPEN and ACCEPTED predicate", async () => {
    const result = await databaseClient.query<{
      columns: string[];
      predicate: string;
    }>(
      `SELECT array_agg(a.attname::text ORDER BY k.ordinality) AS columns,
              pg_get_expr(i.indpred, i.indrelid) AS predicate
       FROM pg_index i
       JOIN pg_class ci ON ci.oid = i.indexrelid
       JOIN pg_class ct ON ct.oid = i.indrelid
       CROSS JOIN LATERAL unnest(i.indkey)
         WITH ORDINALITY AS k(attnum, ordinality)
       JOIN pg_attribute a
         ON a.attrelid = ct.oid AND a.attnum = k.attnum
       WHERE ci.relname = 'retrieval_requests_one_active_per_valet_session_idx'
       GROUP BY i.indpred, i.indrelid`,
    );
    expect(result.rows).toEqual([
      {
        columns: ["valet_session_id"],
        predicate:
          "(status = ANY (ARRAY['OPEN'::retrieval_request_status, 'ACCEPTED'::retrieval_request_status]))",
      },
    ]);
  });

  it("requires requested_at and uses the database current-time default for created_at", async () => {
    const fixture = await createRetrievalRequestTestFixture();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO retrieval_requests (
           id, organization_id, valet_session_id, requested_by_type,
           requested_by_customer_id, status
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.valetSessionId,
          "CUSTOMER",
          fixture.customerId,
          "OPEN",
        ],
      ),
      "requested_at",
    );

    const requestId = await createRetrievalRequest(fixture, {
      requestedByCustomerId: fixture.customerId,
      requestedByType: "CUSTOMER",
      status: "CANCELLED",
    });
    const result = await databaseClient.query<{ created_at: Date }>(
      "SELECT created_at FROM retrieval_requests WHERE id = $1",
      [requestId],
    );
    expect(result.rows[0]?.created_at).toBeInstanceOf(Date);
  });
});

describe("handoff verification database foundation", () => {
  it("applies exactly all nine forward-only migrations in order", () => {
    expect(appliedMigrationDirectories).toEqual(expectedMigrationDirectories);
  });

  it("accepts a valid PICKUP_CODE verification", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);
    const verificationId = await createHandoffVerification(fixture, {
      expiresAt,
      maxAttempts: 5,
      method: "PICKUP_CODE",
      secretHash: `sha256:${randomUUID().replaceAll("-", "")}`,
    });

    const result = await databaseClient.query<{
      attempt_count: number;
      created_at: Date;
      expires_at: Date;
      max_attempts: number;
      method: string;
      secret_hash: string;
    }>(
      `SELECT method::text AS method, secret_hash, expires_at,
              attempt_count, max_attempts, created_at
       FROM handoff_verifications WHERE id = $1`,
      [verificationId],
    );
    expect(result.rows[0]).toEqual({
      attempt_count: 0,
      created_at: expect.any(Date),
      expires_at: expiresAt,
      max_attempts: 5,
      method: "PICKUP_CODE",
      secret_hash: expect.stringMatching(/^sha256:[a-f0-9]+$/),
    });
  });

  it("accepts a valid DYNAMIC_QR verification", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    const verificationId = await createHandoffVerification(fixture, {
      expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
      maxAttempts: 0,
      method: "DYNAMIC_QR",
      secretHash: `sha256:${randomUUID().replaceAll("-", "")}`,
    });

    const result = await databaseClient.query<{
      expires_at: Date;
      method: string;
      secret_hash: string;
    }>(
      `SELECT method::text AS method, secret_hash, expires_at
       FROM handoff_verifications WHERE id = $1`,
      [verificationId],
    );
    expect(result.rows[0]).toEqual({
      expires_at: expect.any(Date),
      method: "DYNAMIC_QR",
      secret_hash: expect.stringMatching(/^sha256:[a-f0-9]+$/),
    });
  });

  it("accepts a valid SUPERVISOR_OVERRIDE with a same-tenant membership and reason", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    const verificationId = await createHandoffVerification(fixture, {
      maxAttempts: 0,
      method: "SUPERVISOR_OVERRIDE",
      overrideReason: "Customer identity confirmed",
      verifiedByMembershipId: fixture.membershipId,
    });

    const result = await databaseClient.query<{
      method: string;
      override_reason: string;
      verified_by_membership_id: string;
    }>(
      `SELECT method::text AS method, override_reason,
              verified_by_membership_id
       FROM handoff_verifications WHERE id = $1`,
      [verificationId],
    );
    expect(result.rows[0]).toEqual({
      method: "SUPERVISOR_OVERRIDE",
      override_reason: "Customer identity confirmed",
      verified_by_membership_id: fixture.membershipId,
    });
  });

  it("defines exactly the documented PostgreSQL handoff method enum", async () => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'handoff_verification_method'
       ORDER BY e.enumsortorder`,
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual([
      "PICKUP_CODE",
      "DYNAMIC_QR",
      "SUPERVISOR_OVERRIDE",
    ]);
  });

  it("rejects an unknown Organization", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        expiresAt: new Date(),
        maxAttempts: 0,
        method: "DYNAMIC_QR",
        organizationId: randomUUID(),
        secretHash: "sha256:unknown-organization",
      }),
      "23503",
    );
  });

  it("rejects a ValetSession from another Organization", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    const otherFixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(
        {
          organizationId: fixture.organizationId,
          valetSessionId: otherFixture.valetSessionId,
        },
        {
          expiresAt: new Date(),
          maxAttempts: 0,
          method: "DYNAMIC_QR",
          secretHash: "sha256:cross-tenant-session",
        },
      ),
      "23503",
      "handoff_verifications_org_valet_session_id_fkey",
    );
  });

  it("rejects a verifying membership from another Organization", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    const otherFixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 0,
        method: "SUPERVISOR_OVERRIDE",
        overrideReason: "Cross-tenant actor must fail",
        verifiedByMembershipId: otherFixture.membershipId,
      }),
      "23503",
      "handoff_verifications_org_verified_by_membership_id_fkey",
    );
  });

  it("uses RESTRICT for every HandoffVerification foreign key and blocks Organization deletion", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    await createHandoffVerification(fixture, {
      maxAttempts: 0,
      method: "SUPERVISOR_OVERRIDE",
      overrideReason: "Deletion protection",
      verifiedByMembershipId: fixture.membershipId,
    });

    const foreignKeys = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'handoff_verifications'::regclass
         AND contype = 'f'
       ORDER BY conname`,
    );
    expect(foreignKeys.rows).toEqual([
      {
        confdeltype: "r",
        conname: "handoff_verifications_org_valet_session_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "handoff_verifications_org_verified_by_membership_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "handoff_verifications_organization_id_fkey",
      },
    ]);
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        fixture.organizationId,
      ]),
      "23503",
    );
  });

  it("restricts deletion of a referenced ValetSession", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    await createHandoffVerification(fixture, {
      expiresAt: new Date(),
      maxAttempts: 0,
      method: "DYNAMIC_QR",
      secretHash: "sha256:session-delete-restriction",
    });

    await expectPostgresError(
      databaseClient.query("DELETE FROM valet_sessions WHERE id = $1", [
        fixture.valetSessionId,
      ]),
      "23503",
      "handoff_verifications_org_valet_session_id_fkey",
    );
  });

  it("restricts deletion of a referenced verifying membership", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    await createHandoffVerification(fixture, {
      maxAttempts: 0,
      method: "SUPERVISOR_OVERRIDE",
      overrideReason: "Membership delete restriction",
      verifiedByMembershipId: fixture.membershipId,
    });

    await expectPostgresError(
      databaseClient.query(
        "DELETE FROM organization_memberships WHERE id = $1",
        [fixture.membershipId],
      ),
      "23503",
      "handoff_verifications_org_verified_by_membership_id_fkey",
    );
  });

  it("defaults attempt_count to 0", async () => {
    const fixture = await createHandoffVerificationTestFixture();
    const verificationId = await createHandoffVerification(fixture, {
      expiresAt: new Date(),
      maxAttempts: 3,
      method: "PICKUP_CODE",
      secretHash: "sha256:default-attempt-count",
    });

    const result = await databaseClient.query<{ attempt_count: number }>(
      "SELECT attempt_count FROM handoff_verifications WHERE id = $1",
      [verificationId],
    );
    expect(result.rows[0]?.attempt_count).toBe(0);
  });

  it("requires max_attempts without a database default", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectNotNullViolation(
      databaseClient.query(
        `INSERT INTO handoff_verifications (
           id, organization_id, valet_session_id, method,
           secret_hash, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.valetSessionId,
          "DYNAMIC_QR",
          "sha256:missing-max-attempts",
          new Date(),
        ],
      ),
      "max_attempts",
    );
  });

  it("rejects PICKUP_CODE without secret_hash", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        expiresAt: new Date(),
        maxAttempts: 5,
        method: "PICKUP_CODE",
      }),
      "23514",
      "handoff_verifications_pickup_code_check",
    );
  });

  it("rejects PICKUP_CODE without expires_at", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 5,
        method: "PICKUP_CODE",
        secretHash: "sha256:missing-expiry",
      }),
      "23514",
      "handoff_verifications_pickup_code_check",
    );
  });

  it("rejects PICKUP_CODE with negative attempt_count", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        attemptCount: -1,
        expiresAt: new Date(),
        maxAttempts: 5,
        method: "PICKUP_CODE",
        secretHash: "sha256:negative-attempt-count",
      }),
      "23514",
      "handoff_verifications_pickup_code_check",
    );
  });

  it("rejects PICKUP_CODE with max_attempts equal to 0", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        expiresAt: new Date(),
        maxAttempts: 0,
        method: "PICKUP_CODE",
        secretHash: "sha256:zero-max-attempts",
      }),
      "23514",
      "handoff_verifications_pickup_code_check",
    );
  });

  it("rejects PICKUP_CODE with negative max_attempts", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        expiresAt: new Date(),
        maxAttempts: -1,
        method: "PICKUP_CODE",
        secretHash: "sha256:negative-max-attempts",
      }),
      "23514",
      "handoff_verifications_pickup_code_check",
    );
  });

  it("rejects DYNAMIC_QR without secret_hash", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        expiresAt: new Date(),
        maxAttempts: 0,
        method: "DYNAMIC_QR",
      }),
      "23514",
      "handoff_verifications_dynamic_qr_check",
    );
  });

  it("rejects DYNAMIC_QR without expires_at", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 0,
        method: "DYNAMIC_QR",
        secretHash: "sha256:dynamic-qr-missing-expiry",
      }),
      "23514",
      "handoff_verifications_dynamic_qr_check",
    );
  });

  it("rejects SUPERVISOR_OVERRIDE without verifying membership", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 0,
        method: "SUPERVISOR_OVERRIDE",
        overrideReason: "Missing actor",
      }),
      "23514",
      "handoff_verifications_supervisor_override_check",
    );
  });

  it("rejects SUPERVISOR_OVERRIDE with null override_reason", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 0,
        method: "SUPERVISOR_OVERRIDE",
        verifiedByMembershipId: fixture.membershipId,
      }),
      "23514",
      "handoff_verifications_supervisor_override_check",
    );
  });

  it("rejects SUPERVISOR_OVERRIDE with an empty override_reason", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 0,
        method: "SUPERVISOR_OVERRIDE",
        overrideReason: "",
        verifiedByMembershipId: fixture.membershipId,
      }),
      "23514",
      "handoff_verifications_supervisor_override_check",
    );
  });

  it("rejects SUPERVISOR_OVERRIDE with a whitespace-only override_reason", async () => {
    const fixture = await createHandoffVerificationTestFixture();

    await expectPostgresError(
      createHandoffVerification(fixture, {
        maxAttempts: 0,
        method: "SUPERVISOR_OVERRIDE",
        overrideReason: "   ",
        verifiedByMembershipId: fixture.membershipId,
      }),
      "23514",
      "handoff_verifications_supervisor_override_check",
    );
  });

  it("creates exactly the documented HandoffVerification columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'handoff_verifications'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "valet_session_id",
      "method",
      "secret_hash",
      "expires_at",
      "attempt_count",
      "max_attempts",
      "verified_at",
      "verified_by_membership_id",
      "consumed_at",
      "override_reason",
      "created_at",
    ]);
  });

  it("does not create plaintext pickup-code or QR-secret columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'handoff_verifications'`,
    );
    const columnNames = result.rows.map((row) => row.column_name);
    expect(columnNames).not.toContain("plaintext_code");
    expect(columnNames).not.toContain("pickup_code");
    expect(columnNames).not.toContain("qr_secret");
    expect(columnNames).not.toContain("token");
  });

  it("creates no non-PK HandoffVerification index or uniqueness constraint", async () => {
    const indexes = await databaseClient.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'handoff_verifications'
       ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "handoff_verifications_pkey",
    ]);

    const uniquenessConstraints = await databaseClient.query<{
      conname: string;
      contype: string;
    }>(
      `SELECT conname, contype
       FROM pg_constraint
       WHERE conrelid = 'handoff_verifications'::regclass
         AND contype IN ('p', 'u')
       ORDER BY conname`,
    );
    expect(uniquenessConstraints.rows).toEqual([
      { conname: "handoff_verifications_pkey", contype: "p" },
    ]);
  });
});

describe("payment, validation, and tip database foundation", () => {
  it("applies the first ten forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 10)).toEqual(
      expectedMigrationDirectories.slice(0, 10),
    );
    expect(appliedMigrationDirectories.at(9)).toBe(
      "20260809001000_payment_validation_tip_foundation",
    );
  });

  it.each([
    ["payment_service_payer", ["CUSTOMER", "VENUE"]],
    ["payment_collection_method", ["NONE", "CASH", "DIGITAL"]],
    ["payment_status", ["NOT_REQUIRED", "UNPAID", "PENDING", "PAID", "FAILED"]],
    ["validation_mode", ["NONE", "FULL", "PARTIAL"]],
  ])("defines exactly the documented %s enum", async (enumName, expected) => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1
       ORDER BY e.enumsortorder`,
      [enumName],
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual(expected);
  });

  it("creates exactly the documented Payment columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'payments'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "location_id",
      "valet_session_id",
      "service_payer",
      "collection_method",
      "currency",
      "service_amount",
      "tip_amount",
      "amount_due",
      "amount_paid",
      "status",
      "creation_idempotency_key",
      "provider",
      "provider_reference",
      "created_at",
      "updated_at",
      "paid_at",
    ]);
  });

  it("creates exactly the documented Validation columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'validations'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "payment_id",
      "mode",
      "amount",
      "is_current",
      "supersedes_validation_id",
      "applied_by_membership_id",
      "applied_at",
      "created_at",
    ]);
  });

  it("uses the documented UUID, enum, text, boolean, and timestamp column types", async () => {
    const result = await databaseClient.query<{
      column_name: string;
      is_nullable: string;
      table_name: string;
      udt_name: string;
    }>(
      `SELECT table_name, column_name, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('payments', 'validations')
         AND data_type <> 'numeric'
       ORDER BY table_name, ordinal_position`,
    );
    expect(result.rows).toEqual([
      {
        column_name: "id",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "uuid",
      },
      {
        column_name: "organization_id",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "uuid",
      },
      {
        column_name: "location_id",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "uuid",
      },
      {
        column_name: "valet_session_id",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "uuid",
      },
      {
        column_name: "service_payer",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "payment_service_payer",
      },
      {
        column_name: "collection_method",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "payment_collection_method",
      },
      {
        column_name: "currency",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "text",
      },
      {
        column_name: "status",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "payment_status",
      },
      {
        column_name: "creation_idempotency_key",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "text",
      },
      {
        column_name: "provider",
        is_nullable: "YES",
        table_name: "payments",
        udt_name: "text",
      },
      {
        column_name: "provider_reference",
        is_nullable: "YES",
        table_name: "payments",
        udt_name: "text",
      },
      {
        column_name: "created_at",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "timestamptz",
      },
      {
        column_name: "updated_at",
        is_nullable: "NO",
        table_name: "payments",
        udt_name: "timestamptz",
      },
      {
        column_name: "paid_at",
        is_nullable: "YES",
        table_name: "payments",
        udt_name: "timestamptz",
      },
      {
        column_name: "id",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "uuid",
      },
      {
        column_name: "organization_id",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "uuid",
      },
      {
        column_name: "payment_id",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "uuid",
      },
      {
        column_name: "mode",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "validation_mode",
      },
      {
        column_name: "is_current",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "bool",
      },
      {
        column_name: "supersedes_validation_id",
        is_nullable: "YES",
        table_name: "validations",
        udt_name: "uuid",
      },
      {
        column_name: "applied_by_membership_id",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "uuid",
      },
      {
        column_name: "applied_at",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "timestamptz",
      },
      {
        column_name: "created_at",
        is_nullable: "NO",
        table_name: "validations",
        udt_name: "timestamptz",
      },
    ]);
  });

  it("uses database time defaults only for created_at", async () => {
    const result = await databaseClient.query<{
      column_default: string | null;
      column_name: string;
      table_name: string;
    }>(
      `SELECT table_name, column_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('payments', 'validations')
         AND column_name IN (
           'service_payer', 'collection_method', 'currency',
           'service_amount', 'tip_amount', 'amount_due', 'amount_paid',
           'status', 'creation_idempotency_key', 'provider',
           'is_current', 'applied_at', 'created_at', 'updated_at'
         )
       ORDER BY table_name, ordinal_position`,
    );
    for (const row of result.rows) {
      if (row.column_name === "created_at") {
        expect(row.column_default).toBe("CURRENT_TIMESTAMP");
      } else {
        expect(row.column_default).toBeNull();
      }
    }
  });

  it("uses numeric(14,3) for every financial money column", async () => {
    const result = await databaseClient.query<{
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
      table_name: string;
    }>(
      `SELECT table_name, column_name, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'payments' AND column_name IN (
             'service_amount', 'tip_amount', 'amount_due', 'amount_paid'
           ))
           OR (table_name = 'validations' AND column_name = 'amount')
         )
       ORDER BY table_name, column_name`,
    );
    expect(result.rows).toEqual([
      {
        column_name: "amount_due",
        numeric_precision: 14,
        numeric_scale: 3,
        table_name: "payments",
      },
      {
        column_name: "amount_paid",
        numeric_precision: 14,
        numeric_scale: 3,
        table_name: "payments",
      },
      {
        column_name: "service_amount",
        numeric_precision: 14,
        numeric_scale: 3,
        table_name: "payments",
      },
      {
        column_name: "tip_amount",
        numeric_precision: 14,
        numeric_scale: 3,
        table_name: "payments",
      },
      {
        column_name: "amount",
        numeric_precision: 14,
        numeric_scale: 3,
        table_name: "validations",
      },
    ]);
  });

  it("does not create deferred Tip or PaymentAttempt tables", async () => {
    const result = await databaseClient.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('tips', 'payment_attempts')`,
    );
    expect(result.rows).toEqual([]);
  });

  it("creates only required Payment and Validation indexes", async () => {
    const result = await databaseClient.query<{
      indexname: string;
      tablename: string;
    }>(
      `SELECT tablename, indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('payments', 'validations')
       ORDER BY tablename, indexname`,
    );
    expect(result.rows).toEqual([
      {
        indexname: "payments_organization_id_creation_idempotency_key",
        tablename: "payments",
      },
      {
        indexname: "payments_organization_id_id_key",
        tablename: "payments",
      },
      {
        indexname: "payments_organization_id_provider_provider_reference_key",
        tablename: "payments",
      },
      {
        indexname: "payments_organization_id_valet_session_id_key",
        tablename: "payments",
      },
      { indexname: "payments_pkey", tablename: "payments" },
      {
        indexname: "validations_one_current_per_payment_idx",
        tablename: "validations",
      },
      {
        indexname: "validations_organization_id_payment_id_id_key",
        tablename: "validations",
      },
      { indexname: "validations_pkey", tablename: "validations" },
    ]);
  });

  it("creates the current-Validation protection as the exact partial unique index", async () => {
    const result = await databaseClient.query<{
      columns: string[];
      indisunique: boolean;
      predicate: string;
    }>(
      `SELECT i.indisunique,
              array_agg(a.attname::text ORDER BY k.ordinality) AS columns,
              pg_get_expr(i.indpred, i.indrelid) AS predicate
       FROM pg_index i
       JOIN pg_class ci ON ci.oid = i.indexrelid
       JOIN pg_class ct ON ct.oid = i.indrelid
       CROSS JOIN LATERAL unnest(i.indkey)
         WITH ORDINALITY AS k(attnum, ordinality)
       JOIN pg_attribute a
         ON a.attrelid = ct.oid AND a.attnum = k.attnum
       WHERE ci.relname = 'validations_one_current_per_payment_idx'
       GROUP BY i.indisunique, i.indpred, i.indrelid`,
    );
    expect(result.rows).toEqual([
      {
        columns: ["payment_id"],
        indisunique: true,
        predicate: "(is_current = true)",
      },
    ]);
  });

  it.each([
    [
      "NONE / NOT_REQUIRED",
      {
        amountDue: "0.000",
        amountPaid: "0.000",
        collectionMethod: "NONE",
        serviceAmount: "10.000",
        status: "NOT_REQUIRED",
      },
    ],
    ["CASH / UNPAID", {}],
    [
      "CASH / PAID",
      { amountPaid: "10.000", paidAt: new Date(), status: "PAID" },
    ],
    [
      "DIGITAL / UNPAID without reference",
      { collectionMethod: "DIGITAL", provider: "gateway", status: "UNPAID" },
    ],
    [
      "DIGITAL / UNPAID with reference",
      {
        collectionMethod: "DIGITAL",
        provider: "gateway",
        providerReference: randomUUID(),
        status: "UNPAID",
      },
    ],
    [
      "DIGITAL / PENDING",
      {
        collectionMethod: "DIGITAL",
        provider: "gateway",
        providerReference: randomUUID(),
        status: "PENDING",
      },
    ],
    [
      "DIGITAL / FAILED without reference",
      { collectionMethod: "DIGITAL", provider: "gateway", status: "FAILED" },
    ],
    [
      "DIGITAL / FAILED with reference",
      {
        collectionMethod: "DIGITAL",
        provider: "gateway",
        providerReference: randomUUID(),
        status: "FAILED",
      },
    ],
    [
      "DIGITAL / PAID",
      {
        amountPaid: "10.000",
        collectionMethod: "DIGITAL",
        paidAt: new Date(),
        provider: "gateway",
        providerReference: randomUUID(),
        status: "PAID",
      },
    ],
    [
      "VENUE responsibility with guest tip only",
      {
        amountDue: "2.500",
        collectionMethod: "CASH",
        servicePayer: "VENUE",
        tipAmount: "2.500",
      },
    ],
  ])("accepts valid Payment row: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    await expect(createPayment(fixture, values)).resolves.toBeTypeOf("string");
  });

  it.each([
    ["NONE with UNPAID", { amountDue: "0.000", collectionMethod: "NONE" }],
    [
      "NOT_REQUIRED with CASH",
      { amountDue: "0.000", collectionMethod: "CASH", status: "NOT_REQUIRED" },
    ],
    [
      "NOT_REQUIRED with DIGITAL",
      {
        amountDue: "0.000",
        collectionMethod: "DIGITAL",
        provider: "gateway",
        status: "NOT_REQUIRED",
      },
    ],
    [
      "NONE with non-zero due",
      { collectionMethod: "NONE", status: "NOT_REQUIRED" },
    ],
    [
      "NONE with non-zero paid",
      {
        amountDue: "1.000",
        amountPaid: "1.000",
        collectionMethod: "NONE",
        status: "NOT_REQUIRED",
      },
    ],
    [
      "NONE with provider",
      {
        amountDue: "0.000",
        collectionMethod: "NONE",
        provider: "gateway",
        status: "NOT_REQUIRED",
      },
    ],
    [
      "NONE with provider reference",
      {
        amountDue: "0.000",
        collectionMethod: "NONE",
        providerReference: randomUUID(),
        status: "NOT_REQUIRED",
      },
    ],
    ["CASH with provider", { provider: "gateway" }],
    ["CASH with provider reference", { providerReference: randomUUID() }],
    ["CASH with PENDING", { status: "PENDING" }],
    ["CASH with FAILED", { status: "FAILED" }],
    ["DIGITAL with null provider", { collectionMethod: "DIGITAL" }],
    [
      "DIGITAL PENDING with null reference",
      { collectionMethod: "DIGITAL", provider: "gateway", status: "PENDING" },
    ],
    [
      "DIGITAL PENDING with non-zero paid",
      {
        amountPaid: "1.000",
        collectionMethod: "DIGITAL",
        provider: "gateway",
        providerReference: randomUUID(),
        status: "PENDING",
      },
    ],
    [
      "DIGITAL PAID with null reference",
      {
        amountPaid: "10.000",
        collectionMethod: "DIGITAL",
        paidAt: new Date(),
        provider: "gateway",
        status: "PAID",
      },
    ],
    [
      "PAID with zero due",
      {
        amountDue: "0.000",
        amountPaid: "0.000",
        paidAt: new Date(),
        status: "PAID",
      },
    ],
    [
      "PAID with mismatched paid amount",
      { amountPaid: "5.000", paidAt: new Date(), status: "PAID" },
    ],
    ["PAID without paid_at", { amountPaid: "10.000", status: "PAID" }],
    ["UNPAID without a positive balance", { amountPaid: "10.000" }],
    [
      "FAILED without a positive balance",
      {
        amountPaid: "10.000",
        collectionMethod: "DIGITAL",
        provider: "gateway",
        status: "FAILED",
      },
    ],
    ["negative service amount", { serviceAmount: "-0.001" }],
    ["negative tip amount", { tipAmount: "-0.001" }],
    ["negative amount due", { amountDue: "-0.001" }],
    ["negative amount paid", { amountPaid: "-0.001" }],
    ["amount paid greater than due", { amountPaid: "10.001" }],
    [
      "VENUE due not equal to tip",
      { amountDue: "3.000", servicePayer: "VENUE", tipAmount: "2.000" },
    ],
    ["malformed currency", { currency: "JODX" }],
    ["lowercase currency", { currency: "jod" }],
  ])("rejects invalid Payment row: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(createPayment(fixture, values), "23514");
  });

  it("enforces one Payment per Organization/ValetSession", async () => {
    const fixture = await createPaymentTestFixture();
    await createPayment(fixture);
    await expectPostgresError(
      createPayment(fixture),
      "23505",
      "payments_organization_id_valet_session_id_key",
    );
  });

  it("scopes creation idempotency uniqueness to Organization", async () => {
    const key = randomUUID();
    const fixture = await createPaymentTestFixture();
    await createPayment(fixture, { creationIdempotencyKey: key });
    const secondSession = await createPaymentTestFixture({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    await expectPostgresError(
      createPayment(secondSession, { creationIdempotencyKey: key }),
      "23505",
      "payments_organization_id_creation_idempotency_key",
    );

    const otherOrganization = await createPaymentTestFixture();
    await expect(
      createPayment(otherOrganization, { creationIdempotencyKey: key }),
    ).resolves.toBeTypeOf("string");
  });

  it("scopes non-null provider-reference uniqueness by Organization and provider", async () => {
    const reference = randomUUID();
    const fixture = await createPaymentTestFixture();
    await createPayment(fixture, {
      collectionMethod: "DIGITAL",
      provider: "gateway-a",
      providerReference: reference,
    });

    const sameTenantSession = await createPaymentTestFixture({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    await expectPostgresError(
      createPayment(sameTenantSession, {
        collectionMethod: "DIGITAL",
        provider: "gateway-a",
        providerReference: reference,
      }),
      "23505",
      "payments_organization_id_provider_provider_reference_key",
    );

    const otherProviderSession = await createPaymentTestFixture({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    await expect(
      createPayment(otherProviderSession, {
        collectionMethod: "DIGITAL",
        provider: "gateway-b",
        providerReference: reference,
      }),
    ).resolves.toBeTypeOf("string");

    const otherOrganization = await createPaymentTestFixture();
    await expect(
      createPayment(otherOrganization, {
        collectionMethod: "DIGITAL",
        provider: "gateway-a",
        providerReference: reference,
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("permits multiple Payment rows with null provider and reference", async () => {
    const tenant = await createTenant();
    const first = await createPaymentTestFixture(tenant);
    const second = await createPaymentTestFixture(tenant);
    await createPayment(first);
    await expect(createPayment(second)).resolves.toBeTypeOf("string");
  });

  it("rejects an unknown Payment Organization", async () => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(
      createPayment(fixture, { organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects a Location from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherTenant = await createTenant();
    await expectPostgresError(
      createPayment(fixture, { locationId: otherTenant.locationId }),
      "23503",
      "payments_org_location_id_fkey",
    );
  });

  it("rejects a ValetSession from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createPayment(fixture, { valetSessionId: otherFixture.valetSessionId }),
      "23503",
      "payments_org_location_valet_session_id_fkey",
    );
  });

  it("rejects a same-Organization ValetSession from a different Location", async () => {
    const organizationId = await createOrganization();
    const firstLocationId = await createLocation(organizationId);
    const secondLocationId = await createLocation(organizationId);
    const firstFixture = await createPaymentTestFixture({
      locationId: firstLocationId,
      organizationId,
    });
    const secondFixture = await createPaymentTestFixture({
      locationId: secondLocationId,
      organizationId,
    });
    await expectPostgresError(
      createPayment(firstFixture, {
        valetSessionId: secondFixture.valetSessionId,
      }),
      "23503",
      "payments_org_location_valet_session_id_fkey",
    );
  });

  it("uses RESTRICT for every Payment foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'payments'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        conname: "payments_org_location_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "payments_org_location_valet_session_id_fkey",
      },
      { confdeltype: "r", conname: "payments_organization_id_fkey" },
    ]);
  });

  it.each(["Organization", "Location", "ValetSession"])(
    "restricts deletion of a referenced Payment %s parent",
    async (parent) => {
      const fixture = await createPaymentTestFixture();
      await createPayment(fixture);
      const statements: Record<string, [string, string]> = {
        Location: ["DELETE FROM locations WHERE id = $1", fixture.locationId],
        Organization: [
          "DELETE FROM organizations WHERE id = $1",
          fixture.organizationId,
        ],
        ValetSession: [
          "DELETE FROM valet_sessions WHERE id = $1",
          fixture.valetSessionId,
        ],
      };
      const [statement, id] = statements[parent]!;
      await expectPostgresError(databaseClient.query(statement, [id]), "23503");
    },
  );

  it.each([
    ["initial FULL", { amount: "10.000", mode: "FULL" }],
    ["initial PARTIAL", { amount: "5.000", mode: "PARTIAL" }],
  ])("accepts valid Validation history: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expect(
      createValidation(fixture, paymentId, values),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts a superseding NONE Validation with amount zero", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const originalId = await createValidation(fixture, paymentId, {
      amount: "10.000",
      isCurrent: false,
      mode: "FULL",
    });
    await expect(
      createValidation(fixture, paymentId, {
        amount: "0.000",
        mode: "NONE",
        supersedesValidationId: originalId,
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("allows multiple historical rows alongside one current Validation", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createValidation(fixture, paymentId, { isCurrent: false });
    await createValidation(fixture, paymentId, {
      amount: "4.000",
      isCurrent: false,
    });
    await expect(
      createValidation(fixture, paymentId, { amount: "3.000" }),
    ).resolves.toBeTypeOf("string");
  });

  it.each([
    ["NONE with non-zero amount", { amount: "1.000", mode: "NONE" }],
    ["NONE without supersession", { amount: "0.000", mode: "NONE" }],
    ["FULL with zero amount", { amount: "0.000", mode: "FULL" }],
    ["FULL with negative amount", { amount: "-0.001", mode: "FULL" }],
    ["PARTIAL with zero amount", { amount: "0.000", mode: "PARTIAL" }],
    ["PARTIAL with negative amount", { amount: "-0.001", mode: "PARTIAL" }],
  ])("rejects invalid Validation row: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createValidation(fixture, paymentId, values),
      "23514",
      "validations_mode_amount_check",
    );
  });

  it("rejects a Validation actor from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createValidation(fixture, paymentId, {
        appliedByMembershipId: otherFixture.membershipId,
      }),
      "23503",
      "validations_org_applied_by_membership_id_fkey",
    );
  });

  it("rejects a Payment from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expectPostgresError(
      createValidation(fixture, otherPaymentId),
      "23503",
      "validations_org_payment_id_fkey",
    );
  });

  it("rejects supersession across Payments", async () => {
    const tenant = await createTenant();
    const firstFixture = await createPaymentTestFixture(tenant);
    const secondFixture = await createPaymentTestFixture(tenant);
    const firstPaymentId = await createPayment(firstFixture);
    const secondPaymentId = await createPayment(secondFixture);
    const otherValidationId = await createValidation(
      secondFixture,
      secondPaymentId,
      { isCurrent: false },
    );
    await expectPostgresError(
      createValidation(firstFixture, firstPaymentId, {
        amount: "0.000",
        mode: "NONE",
        supersedesValidationId: otherValidationId,
      }),
      "23503",
      "validations_org_payment_supersedes_id_fkey",
    );
  });

  it("rejects a second current Validation for one Payment", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createValidation(fixture, paymentId);
    await expectPostgresError(
      createValidation(fixture, paymentId, { amount: "4.000" }),
      "23505",
      "validations_one_current_per_payment_idx",
    );
  });

  it("uses RESTRICT for every Validation foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'validations'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        conname: "validations_org_applied_by_membership_id_fkey",
      },
      { confdeltype: "r", conname: "validations_org_payment_id_fkey" },
      {
        confdeltype: "r",
        conname: "validations_org_payment_supersedes_id_fkey",
      },
      { confdeltype: "r", conname: "validations_organization_id_fkey" },
    ]);
  });

  it("restricts deletion of a Payment referenced by Validation", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createValidation(fixture, paymentId);
    await expectPostgresError(
      databaseClient.query("DELETE FROM payments WHERE id = $1", [paymentId]),
      "23503",
      "validations_org_payment_id_fkey",
    );
  });

  it("restricts deletion of an applying membership", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createValidation(fixture, paymentId);
    await expectPostgresError(
      databaseClient.query(
        "DELETE FROM organization_memberships WHERE id = $1",
        [fixture.membershipId],
      ),
      "23503",
      "validations_org_applied_by_membership_id_fkey",
    );
  });

  it("restricts deletion of a superseded Validation", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const originalId = await createValidation(fixture, paymentId, {
      isCurrent: false,
    });
    await createValidation(fixture, paymentId, {
      amount: "0.000",
      mode: "NONE",
      supersedesValidationId: originalId,
    });
    await expectPostgresError(
      databaseClient.query("DELETE FROM validations WHERE id = $1", [
        originalId,
      ]),
      "23503",
      "validations_org_payment_supersedes_id_fkey",
    );
  });
});

describe("cash entry and payment provider event database foundation", () => {
  it("applies the first eleven forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 11)).toEqual(
      expectedMigrationDirectories.slice(0, 11),
    );
    expect(appliedMigrationDirectories.at(10)).toBe(
      "20260809001100_cash_entry_provider_event_foundation",
    );
  });

  it.each([
    [
      "cash_entry_type",
      ["RECEIPT", "ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE"],
    ],
    ["payment_provider_event_processing_status", ["PROCESSED", "IGNORED"]],
  ])("defines exactly the documented %s enum", async (enumName, expected) => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1
       ORDER BY e.enumsortorder`,
      [enumName],
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual(expected);
  });

  it("creates exactly the documented CashEntry columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'cash_entries'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "payment_id",
      "entry_type",
      "amount",
      "received_or_adjusted_by_membership_id",
      "reason",
      "submission_idempotency_key",
      "occurred_at",
      "created_at",
    ]);
  });

  it("creates exactly the documented PaymentProviderEvent columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_provider_events'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "payment_id",
      "refund_id",
      "provider",
      "provider_event_id",
      "provider_reference",
      "processing_status",
      "received_at",
      "processed_at",
      "safe_result_code",
      "created_at",
    ]);
  });

  it("uses the exact documented physical types and nullability", async () => {
    const result = await databaseClient.query<{
      column_name: string;
      is_nullable: string;
      table_name: string;
      udt_name: string;
    }>(
      `SELECT table_name, column_name, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('cash_entries', 'payment_provider_events')
       ORDER BY table_name, ordinal_position`,
    );
    expect(result.rows).toEqual([
      {
        column_name: "id",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "uuid",
      },
      {
        column_name: "organization_id",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "uuid",
      },
      {
        column_name: "payment_id",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "uuid",
      },
      {
        column_name: "entry_type",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "cash_entry_type",
      },
      {
        column_name: "amount",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "numeric",
      },
      {
        column_name: "received_or_adjusted_by_membership_id",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "uuid",
      },
      {
        column_name: "reason",
        is_nullable: "YES",
        table_name: "cash_entries",
        udt_name: "text",
      },
      {
        column_name: "submission_idempotency_key",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "text",
      },
      {
        column_name: "occurred_at",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "timestamptz",
      },
      {
        column_name: "created_at",
        is_nullable: "NO",
        table_name: "cash_entries",
        udt_name: "timestamptz",
      },
      {
        column_name: "id",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "uuid",
      },
      {
        column_name: "organization_id",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "uuid",
      },
      {
        column_name: "payment_id",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "uuid",
      },
      {
        column_name: "refund_id",
        is_nullable: "YES",
        table_name: "payment_provider_events",
        udt_name: "uuid",
      },
      {
        column_name: "provider",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "text",
      },
      {
        column_name: "provider_event_id",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "text",
      },
      {
        column_name: "provider_reference",
        is_nullable: "YES",
        table_name: "payment_provider_events",
        udt_name: "text",
      },
      {
        column_name: "processing_status",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "payment_provider_event_processing_status",
      },
      {
        column_name: "received_at",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "timestamptz",
      },
      {
        column_name: "processed_at",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "timestamptz",
      },
      {
        column_name: "safe_result_code",
        is_nullable: "YES",
        table_name: "payment_provider_events",
        udt_name: "text",
      },
      {
        column_name: "created_at",
        is_nullable: "NO",
        table_name: "payment_provider_events",
        udt_name: "timestamptz",
      },
    ]);
  });

  it("uses database defaults only for created_at", async () => {
    const result = await databaseClient.query<{
      column_default: string | null;
      column_name: string;
      table_name: string;
    }>(
      `SELECT table_name, column_name, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('cash_entries', 'payment_provider_events')
       ORDER BY table_name, ordinal_position`,
    );
    for (const row of result.rows) {
      if (row.column_name === "created_at") {
        expect(row.column_default).toBe("CURRENT_TIMESTAMP");
      } else {
        expect(row.column_default).toBeNull();
      }
    }
  });

  it("stores CashEntry amount as numeric(14,3)", async () => {
    const result = await databaseClient.query<{
      numeric_precision: number;
      numeric_scale: number;
    }>(
      `SELECT numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'cash_entries'
         AND column_name = 'amount'`,
    );
    expect(result.rows).toEqual([{ numeric_precision: 14, numeric_scale: 3 }]);
  });

  it("does not create a PaymentAttempt table", async () => {
    const result = await databaseClient.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'payment_attempts'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("does not create raw payload, credential, signature, token, or card columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'payment_provider_events'`,
    );
    const columns = result.rows.map((row) => row.column_name);
    for (const forbidden of [
      "raw_payload",
      "payload_json",
      "headers",
      "request_body",
      "signature",
      "signature_header",
      "secret",
      "credential",
      "payment_token",
      "pan",
      "cvv",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("creates only the required CashEntry and ProviderEvent indexes", async () => {
    const result = await databaseClient.query<{
      indexname: string;
      tablename: string;
    }>(
      `SELECT tablename, indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename IN ('cash_entries', 'payment_provider_events')
       ORDER BY tablename, indexname`,
    );
    expect(result.rows).toEqual([
      {
        indexname: "cash_entries_one_receipt_per_payment_idx",
        tablename: "cash_entries",
      },
      {
        indexname: "cash_entries_organization_id_submission_idempotency_key",
        tablename: "cash_entries",
      },
      { indexname: "cash_entries_pkey", tablename: "cash_entries" },
      {
        indexname: "payment_provider_events_org_provider_event_id_key",
        tablename: "payment_provider_events",
      },
      {
        indexname: "payment_provider_events_pkey",
        tablename: "payment_provider_events",
      },
    ]);
  });

  it("creates the one-receipt protection as the exact partial unique index", async () => {
    const result = await databaseClient.query<{
      columns: string[];
      indisunique: boolean;
      predicate: string;
    }>(
      `SELECT i.indisunique,
              array_agg(a.attname::text ORDER BY k.ordinality) AS columns,
              pg_get_expr(i.indpred, i.indrelid) AS predicate
       FROM pg_index i
       JOIN pg_class ci ON ci.oid = i.indexrelid
       JOIN pg_class ct ON ct.oid = i.indrelid
       CROSS JOIN LATERAL unnest(i.indkey)
         WITH ORDINALITY AS k(attnum, ordinality)
       JOIN pg_attribute a
         ON a.attrelid = ct.oid AND a.attnum = k.attnum
       WHERE ci.relname = 'cash_entries_one_receipt_per_payment_idx'
       GROUP BY i.indisunique, i.indpred, i.indrelid`,
    );
    expect(result.rows).toEqual([
      {
        columns: ["payment_id"],
        indisunique: true,
        predicate: "(entry_type = 'RECEIPT'::cash_entry_type)",
      },
    ]);
  });

  it.each([
    ["RECEIPT with positive amount", {}],
    ["RECEIPT with null reason", { reason: null }],
    [
      "ADJUSTMENT_INCREASE with reason",
      { entryType: "ADJUSTMENT_INCREASE", reason: "Recorded cash increase" },
    ],
    [
      "ADJUSTMENT_DECREASE with reason",
      { entryType: "ADJUSTMENT_DECREASE", reason: "Recorded cash decrease" },
    ],
    [
      "ADJUSTMENT_INCREASE with surrounding whitespace and non-empty content",
      { entryType: "ADJUSTMENT_INCREASE", reason: " correction " },
    ],
  ])("accepts valid CashEntry: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expect(
      createCashEntry(fixture, paymentId, values),
    ).resolves.toBeTypeOf("string");
  });

  it("allows multiple adjustments for one Payment", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createCashEntry(fixture, paymentId, {
      entryType: "ADJUSTMENT_INCREASE",
      reason: "First correction",
    });
    await expect(
      createCashEntry(fixture, paymentId, {
        entryType: "ADJUSTMENT_DECREASE",
        reason: "Second correction",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it.each([
    ["zero amount", { amount: "0.000" }],
    ["negative amount", { amount: "-0.001" }],
    ["increase with null reason", { entryType: "ADJUSTMENT_INCREASE" }],
    ["decrease with null reason", { entryType: "ADJUSTMENT_DECREASE" }],
    [
      "adjustment with empty reason",
      { entryType: "ADJUSTMENT_INCREASE", reason: "" },
    ],
    [
      "adjustment with whitespace reason",
      { entryType: "ADJUSTMENT_DECREASE", reason: "   " },
    ],
  ])("rejects invalid CashEntry: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createCashEntry(fixture, paymentId, values),
      "23514",
    );
  });

  it("rejects a CashEntry Payment from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expectPostgresError(
      createCashEntry(fixture, otherPaymentId),
      "23503",
      "cash_entries_org_payment_id_fkey",
    );
  });

  it("rejects a CashEntry actor from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createCashEntry(fixture, paymentId, {
        receivedOrAdjustedByMembershipId: otherFixture.membershipId,
      }),
      "23503",
      "cash_entries_org_received_or_adjusted_by_membership_id_fkey",
    );
  });

  it("scopes cash submission idempotency to Organization", async () => {
    const key = randomUUID();
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createCashEntry(fixture, paymentId, {
      submissionIdempotencyKey: key,
    });
    await expectPostgresError(
      createCashEntry(fixture, paymentId, {
        entryType: "ADJUSTMENT_INCREASE",
        reason: "Replay must fail",
        submissionIdempotencyKey: key,
      }),
      "23505",
      "cash_entries_organization_id_submission_idempotency_key",
    );

    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expect(
      createCashEntry(otherFixture, otherPaymentId, {
        submissionIdempotencyKey: key,
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects a second RECEIPT for one Payment", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createCashEntry(fixture, paymentId);
    await expectPostgresError(
      createCashEntry(fixture, paymentId),
      "23505",
      "cash_entries_one_receipt_per_payment_idx",
    );
  });

  it("uses RESTRICT for every CashEntry foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'cash_entries'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        conname: "cash_entries_org_payment_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "cash_entries_org_received_or_adjusted_by_membership_id_fkey",
      },
      { confdeltype: "r", conname: "cash_entries_organization_id_fkey" },
    ]);
  });

  it.each(["Organization", "Payment", "OrganizationMembership"])(
    "restricts deletion of a CashEntry %s parent",
    async (parent) => {
      const fixture = await createPaymentTestFixture();
      const paymentId = await createPayment(fixture);
      await createCashEntry(fixture, paymentId);
      const statements: Record<string, [string, string]> = {
        Organization: [
          "DELETE FROM organizations WHERE id = $1",
          fixture.organizationId,
        ],
        OrganizationMembership: [
          "DELETE FROM organization_memberships WHERE id = $1",
          fixture.membershipId,
        ],
        Payment: ["DELETE FROM payments WHERE id = $1", paymentId],
      };
      const [statement, id] = statements[parent]!;
      await expectPostgresError(databaseClient.query(statement, [id]), "23503");
    },
  );

  it.each([
    ["PROCESSED without provider reference", {}],
    ["PROCESSED with provider reference", { providerReference: randomUUID() }],
    ["IGNORED", { processingStatus: "IGNORED", safeResultCode: "UNRELATED" }],
  ])("accepts valid PaymentProviderEvent: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expect(
      createPaymentProviderEvent(fixture, paymentId, values),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts multiple event IDs sharing one provider reference", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const providerReference = randomUUID();
    await createPaymentProviderEvent(fixture, paymentId, {
      providerEventId: randomUUID(),
      providerReference,
    });
    await expect(
      createPaymentProviderEvent(fixture, paymentId, {
        providerEventId: randomUUID(),
        providerReference,
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts a null refund_id", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expect(
      createPaymentProviderEvent(fixture, paymentId, { refundId: null }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects an unknown ProviderEvent Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createPaymentProviderEvent(fixture, paymentId, {
        organizationId: randomUUID(),
      }),
      "23503",
    );
  });

  it("rejects a ProviderEvent Payment from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expectPostgresError(
      createPaymentProviderEvent(fixture, otherPaymentId),
      "23503",
      "payment_provider_events_org_payment_id_fkey",
    );
  });

  it("rejects an unknown non-null refund_id", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createPaymentProviderEvent(fixture, paymentId, {
        refundId: randomUUID(),
      }),
      "23503",
      "payment_provider_events_org_payment_refund_id_fkey",
    );
  });

  it("scopes provider-event idempotency by Organization and provider", async () => {
    const providerEventId = randomUUID();
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createPaymentProviderEvent(fixture, paymentId, { providerEventId });
    await expectPostgresError(
      createPaymentProviderEvent(fixture, paymentId, { providerEventId }),
      "23505",
      "payment_provider_events_org_provider_event_id_key",
    );

    const otherProviderFixture = await createPaymentTestFixture({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    const otherProviderPaymentId = await createPayment(otherProviderFixture);
    await expect(
      createPaymentProviderEvent(otherProviderFixture, otherProviderPaymentId, {
        provider: "other-gateway",
        providerEventId,
      }),
    ).resolves.toBeTypeOf("string");

    const otherOrganization = await createPaymentTestFixture();
    const otherOrganizationPaymentId = await createPayment(otherOrganization);
    await expect(
      createPaymentProviderEvent(
        otherOrganization,
        otherOrganizationPaymentId,
        { providerEventId },
      ),
    ).resolves.toBeTypeOf("string");
  });

  it("uses RESTRICT for every PaymentProviderEvent foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'payment_provider_events'::regclass
         AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        conname: "payment_provider_events_org_payment_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "payment_provider_events_org_payment_refund_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "payment_provider_events_organization_id_fkey",
      },
    ]);
  });

  it.each(["Organization", "Payment"])(
    "restricts deletion of a PaymentProviderEvent %s parent",
    async (parent) => {
      const fixture = await createPaymentTestFixture();
      const paymentId = await createPayment(fixture);
      await createPaymentProviderEvent(fixture, paymentId);
      const statements: Record<string, [string, string]> = {
        Organization: [
          "DELETE FROM organizations WHERE id = $1",
          fixture.organizationId,
        ],
        Payment: ["DELETE FROM payments WHERE id = $1", paymentId],
      };
      const [statement, id] = statements[parent]!;
      await expectPostgresError(databaseClient.query(statement, [id]), "23503");
    },
  );
});

describe("refund database foundation", () => {
  it("applies the first twelve forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 12)).toEqual(
      expectedMigrationDirectories.slice(0, 12),
    );
    expect(appliedMigrationDirectories.at(11)).toBe(
      "20260809001200_refund_foundation",
    );
  });

  it("defines exactly the documented refund_status enum", async () => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'refund_status'
       ORDER BY e.enumsortorder`,
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual([
      "PENDING",
      "SUCCEEDED",
      "FAILED",
    ]);
  });

  it("creates exactly the documented Refund columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'refunds'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "payment_id",
      "amount",
      "reason",
      "status",
      "authorized_by_membership_id",
      "idempotency_key",
      "provider",
      "provider_reference",
      "requested_at",
      "completed_at",
      "created_at",
    ]);
  });

  it("uses the exact documented Refund types, nullability, and defaults", async () => {
    const result = await databaseClient.query<{
      column_default: string | null;
      column_name: string;
      is_nullable: string;
      udt_name: string;
    }>(
      `SELECT column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'refunds'
       ORDER BY ordinal_position`,
    );
    expect(result.rows).toEqual([
      {
        column_default: null,
        column_name: "id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "organization_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "payment_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "amount",
        is_nullable: "NO",
        udt_name: "numeric",
      },
      {
        column_default: null,
        column_name: "reason",
        is_nullable: "NO",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "status",
        is_nullable: "NO",
        udt_name: "refund_status",
      },
      {
        column_default: null,
        column_name: "authorized_by_membership_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "idempotency_key",
        is_nullable: "NO",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "provider",
        is_nullable: "YES",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "provider_reference",
        is_nullable: "YES",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "requested_at",
        is_nullable: "NO",
        udt_name: "timestamptz",
      },
      {
        column_default: null,
        column_name: "completed_at",
        is_nullable: "YES",
        udt_name: "timestamptz",
      },
      {
        column_default: "CURRENT_TIMESTAMP",
        column_name: "created_at",
        is_nullable: "NO",
        udt_name: "timestamptz",
      },
    ]);
  });

  it("stores Refund amount as numeric(14,3)", async () => {
    const result = await databaseClient.query<{
      numeric_precision: number;
      numeric_scale: number;
    }>(
      `SELECT numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'refunds'
         AND column_name = 'amount'`,
    );
    expect(result.rows).toEqual([{ numeric_precision: 14, numeric_scale: 3 }]);
  });

  it("does not add PaymentAttempt or REFUNDED Payment status", async () => {
    const tables = await databaseClient.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'payment_attempts'`,
    );
    expect(tables.rows).toEqual([]);

    const statuses = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'payment_status'
       ORDER BY e.enumsortorder`,
    );
    expect(statuses.rows.map((row) => row.enumlabel)).toEqual([
      "NOT_REQUIRED",
      "UNPAID",
      "PENDING",
      "PAID",
      "FAILED",
    ]);
  });

  it("does not create sensitive provider, card, or payload fields", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'refunds'`,
    );
    const columns = result.rows.map((row) => row.column_name);
    for (const forbidden of [
      "raw_payload",
      "request_body",
      "headers",
      "pan",
      "cvv",
      "payment_token",
      "credential",
      "secret",
      "updated_at",
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it("creates only the required Refund indexes and uniqueness", async () => {
    const result = await databaseClient.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'refunds'
       ORDER BY indexname`,
    );
    expect(result.rows.map((row) => row.indexname)).toEqual([
      "refunds_organization_id_idempotency_key",
      "refunds_organization_id_payment_id_id_key",
      "refunds_organization_id_provider_provider_reference_key",
      "refunds_pkey",
    ]);
  });

  it.each([
    ["digital PENDING without reference", {}],
    ["digital PENDING with reference", { providerReference: randomUUID() }],
    ["digital FAILED without reference", { status: "FAILED" }],
    [
      "digital FAILED with reference",
      { status: "FAILED", providerReference: randomUUID() },
    ],
    [
      "cash-form SUCCEEDED",
      { completedAt: new Date(), provider: null, status: "SUCCEEDED" },
    ],
    [
      "digital-form SUCCEEDED",
      {
        completedAt: new Date(),
        providerReference: randomUUID(),
        status: "SUCCEEDED",
      },
    ],
    [
      "reason with surrounding whitespace",
      { reason: " customer requested refund " },
    ],
  ])("accepts valid Refund: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expect(createRefund(fixture, paymentId, values)).resolves.toBeTypeOf(
      "string",
    );
  });

  it("allows multiple Refund rows for one Payment", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createRefund(fixture, paymentId);
    await expect(createRefund(fixture, paymentId)).resolves.toBeTypeOf(
      "string",
    );
  });

  it.each([
    ["zero amount", { amount: "0.000" }],
    ["negative amount", { amount: "-0.001" }],
    ["empty reason", { reason: "" }],
    ["whitespace-only reason", { reason: "   " }],
  ])("rejects invalid Refund amount/reason: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createRefund(fixture, paymentId, values),
      "23514",
    );
  });

  it.each([
    ["PENDING with null provider", { provider: null }],
    ["PENDING with completed_at", { completedAt: new Date() }],
    ["FAILED with null provider", { provider: null, status: "FAILED" }],
    ["FAILED with completed_at", { completedAt: new Date(), status: "FAILED" }],
    ["SUCCEEDED without completed_at", { provider: null, status: "SUCCEEDED" }],
    [
      "SUCCEEDED with provider but no reference",
      { completedAt: new Date(), status: "SUCCEEDED" },
    ],
    [
      "SUCCEEDED with reference but null provider",
      {
        completedAt: new Date(),
        provider: null,
        providerReference: randomUUID(),
        status: "SUCCEEDED",
      },
    ],
  ])("rejects invalid Refund state matrix: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createRefund(fixture, paymentId, values),
      "23514",
    );
  });

  it("rejects an unknown Refund Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expectPostgresError(
      createRefund(fixture, paymentId, { organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects a Refund Payment from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expectPostgresError(
      createRefund(fixture, otherPaymentId),
      "23503",
      "refunds_org_payment_id_fkey",
    );
  });

  it("rejects a Refund authorizer from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createRefund(fixture, paymentId, {
        authorizedByMembershipId: otherFixture.membershipId,
      }),
      "23503",
      "refunds_org_authorized_by_membership_id_fkey",
    );
  });

  it("scopes Refund idempotency to Organization", async () => {
    const idempotencyKey = randomUUID();
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await createRefund(fixture, paymentId, { idempotencyKey });
    await expectPostgresError(
      createRefund(fixture, paymentId, { idempotencyKey }),
      "23505",
      "refunds_organization_id_idempotency_key",
    );

    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expect(
      createRefund(otherFixture, otherPaymentId, { idempotencyKey }),
    ).resolves.toBeTypeOf("string");
  });

  it("enforces provider-reference uniqueness with PostgreSQL null semantics", async () => {
    const providerReference = randomUUID();
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const succeeded = {
      completedAt: new Date(),
      providerReference,
      status: "SUCCEEDED",
    };
    await createRefund(fixture, paymentId, succeeded);
    await expectPostgresError(
      createRefund(fixture, paymentId, succeeded),
      "23505",
      "refunds_organization_id_provider_provider_reference_key",
    );
    await expect(
      createRefund(fixture, paymentId, {
        ...succeeded,
        provider: "other-gateway",
      }),
    ).resolves.toBeTypeOf("string");

    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    await expect(
      createRefund(otherFixture, otherPaymentId, succeeded),
    ).resolves.toBeTypeOf("string");

    await expect(
      createRefund(fixture, paymentId, {
        completedAt: new Date(),
        provider: null,
        status: "SUCCEEDED",
      }),
    ).resolves.toBeTypeOf("string");
    await expect(
      createRefund(fixture, paymentId, {
        completedAt: new Date(),
        provider: null,
        status: "SUCCEEDED",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("removes the temporary ProviderEvent refund-null constraint", async () => {
    const result = await databaseClient.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conname = 'payment_provider_events_refund_id_null_check'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("keeps ProviderEvent refund_id nullable", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    await expect(
      createPaymentProviderEvent(fixture, paymentId, { refundId: null }),
    ).resolves.toBeTypeOf("string");
  });

  it("allows ProviderEvent to reference a Refund for the same Organization and Payment", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const refundId = await createRefund(fixture, paymentId);
    await expect(
      createPaymentProviderEvent(fixture, paymentId, { refundId }),
    ).resolves.toBeTypeOf("string");
  });

  it("rejects ProviderEvent Refund from another Payment in the same Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const otherFixture = await createPaymentTestFixture({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    const otherPaymentId = await createPayment(otherFixture);
    const refundId = await createRefund(otherFixture, otherPaymentId);
    await expectPostgresError(
      createPaymentProviderEvent(fixture, paymentId, { refundId }),
      "23503",
      "payment_provider_events_org_payment_refund_id_fkey",
    );
  });

  it("rejects ProviderEvent Refund from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const otherFixture = await createPaymentTestFixture();
    const otherPaymentId = await createPayment(otherFixture);
    const refundId = await createRefund(otherFixture, otherPaymentId);
    await expectPostgresError(
      createPaymentProviderEvent(fixture, paymentId, { refundId }),
      "23503",
      "payment_provider_events_org_payment_refund_id_fkey",
    );
  });

  it("creates the exact restrictive composite ProviderEvent Refund FK", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      source_columns: string[];
      target_columns: string[];
    }>(
      `SELECT c.confdeltype,
              array_agg(source.attname::text ORDER BY keys.ordinality) AS source_columns,
              array_agg(target.attname::text ORDER BY keys.ordinality) AS target_columns
       FROM pg_constraint c
       CROSS JOIN LATERAL unnest(c.conkey, c.confkey)
         WITH ORDINALITY AS keys(source_attnum, target_attnum, ordinality)
       JOIN pg_attribute source
         ON source.attrelid = c.conrelid AND source.attnum = keys.source_attnum
       JOIN pg_attribute target
         ON target.attrelid = c.confrelid AND target.attnum = keys.target_attnum
       WHERE c.conname = 'payment_provider_events_org_payment_refund_id_fkey'
       GROUP BY c.confdeltype`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        source_columns: ["organization_id", "payment_id", "refund_id"],
        target_columns: ["organization_id", "payment_id", "id"],
      },
    ]);
  });

  it("rejects deletion of a Refund referenced by ProviderEvent", async () => {
    const fixture = await createPaymentTestFixture();
    const paymentId = await createPayment(fixture);
    const refundId = await createRefund(fixture, paymentId);
    await createPaymentProviderEvent(fixture, paymentId, { refundId });
    await expectPostgresError(
      databaseClient.query("DELETE FROM refunds WHERE id = $1", [refundId]),
      "23503",
      "payment_provider_events_org_payment_refund_id_fkey",
    );
  });

  it("uses RESTRICT for every Refund foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'refunds'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        conname: "refunds_org_authorized_by_membership_id_fkey",
      },
      { confdeltype: "r", conname: "refunds_org_payment_id_fkey" },
      { confdeltype: "r", conname: "refunds_organization_id_fkey" },
    ]);
  });

  it.each(["Organization", "Payment", "OrganizationMembership"])(
    "restricts deletion of a Refund %s parent",
    async (parent) => {
      const fixture = await createPaymentTestFixture();
      const paymentId = await createPayment(fixture);
      await createRefund(fixture, paymentId);
      const statements: Record<string, [string, string]> = {
        Organization: [
          "DELETE FROM organizations WHERE id = $1",
          fixture.organizationId,
        ],
        OrganizationMembership: [
          "DELETE FROM organization_memberships WHERE id = $1",
          fixture.membershipId,
        ],
        Payment: ["DELETE FROM payments WHERE id = $1", paymentId],
      };
      const [statement, id] = statements[parent]!;
      await expectPostgresError(databaseClient.query(statement, [id]), "23503");
    },
  );
});

describe("incident database foundation", () => {
  it("applies the first thirteen forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 13)).toEqual(
      expectedMigrationDirectories.slice(0, 13),
    );
    expect(appliedMigrationDirectories.at(12)).toBe(
      "20260809001300_incident_foundation",
    );
  });

  it.each([
    ["incident_status", ["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]],
    ["incident_severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]],
  ])("defines exactly the documented %s enum", async (enumName, expected) => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1
       ORDER BY e.enumsortorder`,
      [enumName],
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual(expected);
  });

  it("does not create an incident_type PostgreSQL enum", async () => {
    const result = await databaseClient.query<{ typname: string }>(
      `SELECT typname
       FROM pg_type
       WHERE typname = 'incident_type'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("creates exactly the documented Incident columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'incidents'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "location_id",
      "valet_session_id",
      "status",
      "severity",
      "type",
      "description",
      "reported_by_membership_id",
      "created_at",
      "resolved_at",
      "resolved_by_membership_id",
      "resolution_notes",
    ]);
  });

  it("uses the exact documented Incident types, nullability, and defaults", async () => {
    const result = await databaseClient.query<{
      column_default: string | null;
      column_name: string;
      is_nullable: string;
      udt_name: string;
    }>(
      `SELECT column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'incidents'
       ORDER BY ordinal_position`,
    );
    expect(result.rows).toEqual([
      {
        column_default: null,
        column_name: "id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "organization_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "location_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "valet_session_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "status",
        is_nullable: "NO",
        udt_name: "incident_status",
      },
      {
        column_default: null,
        column_name: "severity",
        is_nullable: "NO",
        udt_name: "incident_severity",
      },
      {
        column_default: null,
        column_name: "type",
        is_nullable: "NO",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "description",
        is_nullable: "NO",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "reported_by_membership_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: "CURRENT_TIMESTAMP",
        column_name: "created_at",
        is_nullable: "NO",
        udt_name: "timestamptz",
      },
      {
        column_default: null,
        column_name: "resolved_at",
        is_nullable: "YES",
        udt_name: "timestamptz",
      },
      {
        column_default: null,
        column_name: "resolved_by_membership_id",
        is_nullable: "YES",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "resolution_notes",
        is_nullable: "YES",
        udt_name: "text",
      },
    ]);
  });

  it("does not create evidence, claim, attachment, or generic metadata persistence", async () => {
    const columns = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'incidents'`,
    );
    for (const forbidden of [
      "updated_at",
      "task_id",
      "evidence_id",
      "evidence_hash",
      "claim_id",
      "claim_number",
      "attachment_id",
      "metadata",
      "metadata_json",
      "policy_flags",
    ]) {
      expect(columns.rows.map((row) => row.column_name)).not.toContain(
        forbidden,
      );
    }

    const tables = await databaseClient.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN (
           'incident_evidence', 'incident_evidences', 'claims',
           'incident_attachments'
         )`,
    );
    expect(tables.rows).toEqual([]);
  });

  it("does not create Incident database triggers", async () => {
    const result = await databaseClient.query<{ trigger_name: string }>(
      `SELECT trigger_name
       FROM information_schema.triggers
       WHERE event_object_schema = 'public'
         AND event_object_table = 'incidents'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("creates only the Incident primary key and required query index", async () => {
    const result = await databaseClient.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'incidents'
       ORDER BY indexname`,
    );
    expect(result.rows.map((row) => row.indexname)).toEqual([
      "incidents_location_id_status_idx",
      "incidents_pkey",
    ]);
  });

  it("creates the exact non-unique location/status Incident index", async () => {
    const result = await databaseClient.query<{
      columns: string[];
      indisunique: boolean;
    }>(
      `SELECT i.indisunique,
              array_agg(a.attname::text ORDER BY keys.ordinality) AS columns
       FROM pg_index i
       JOIN pg_class index_class ON index_class.oid = i.indexrelid
       JOIN pg_class table_class ON table_class.oid = i.indrelid
       CROSS JOIN LATERAL unnest(i.indkey)
         WITH ORDINALITY AS keys(attnum, ordinality)
       JOIN pg_attribute a
         ON a.attrelid = table_class.oid AND a.attnum = keys.attnum
       WHERE index_class.relname = 'incidents_location_id_status_idx'
       GROUP BY i.indisunique`,
    );
    expect(result.rows).toEqual([
      { columns: ["location_id", "status"], indisunique: false },
    ]);
  });

  it("accepts a minimal OPEN Incident with nullable resolution fields", async () => {
    const fixture = await createPaymentTestFixture();
    await expect(createIncident(fixture)).resolves.toBeTypeOf("string");
  });

  it.each(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"])(
    "accepts Incident status %s without lifecycle coupling",
    async (status) => {
      const fixture = await createPaymentTestFixture();
      await expect(createIncident(fixture, { status })).resolves.toBeTypeOf(
        "string",
      );
    },
  );

  it.each(["LOW", "MEDIUM", "HIGH", "CRITICAL"])(
    "accepts Incident severity %s",
    async (severity) => {
      const fixture = await createPaymentTestFixture();
      await expect(createIncident(fixture, { severity })).resolves.toBeTypeOf(
        "string",
      );
    },
  );

  it.each(["VEHICLE_DAMAGE", "CUSTOM_OPERATOR_CATEGORY"])(
    "accepts Incident TEXT type %s",
    async (type) => {
      const fixture = await createPaymentTestFixture();
      await expect(createIncident(fixture, { type })).resolves.toBeTypeOf(
        "string",
      );
    },
  );

  it("accepts a same-Organization optional resolver without status coupling", async () => {
    const fixture = await createPaymentTestFixture();
    const resolver = await createStaff(fixture.organizationId);
    await expect(
      createIncident(fixture, {
        resolutionNotes: "Reviewed by supervisor",
        resolvedAt: new Date(),
        resolvedByMembershipId: resolver.membershipId,
        status: "OPEN",
      }),
    ).resolves.toBeTypeOf("string");
  });

  it.each([
    ["undocumented status", { status: "BLOCKED" }],
    ["undocumented severity", { severity: "URGENT" }],
  ])("rejects invalid Incident enum: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(createIncident(fixture, values), "22P02");
  });

  it("rejects an unknown Incident Organization", async () => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(
      createIncident(fixture, { organizationId: randomUUID() }),
      "23503",
    );
  });

  it("rejects an Incident Location from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createIncident(fixture, { locationId: otherFixture.locationId }),
      "23503",
      "incidents_org_location_id_fkey",
    );
  });

  it("rejects an Incident ValetSession from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createIncident(fixture, { valetSessionId: otherFixture.valetSessionId }),
      "23503",
      "incidents_org_location_valet_session_id_fkey",
    );
  });

  it("rejects an Incident ValetSession from another Location in the same Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherLocationId = await createLocation(fixture.organizationId);
    const otherSessionFixture = await createValetSessionFixture({
      locationId: otherLocationId,
      organizationId: fixture.organizationId,
    });
    const otherSessionId = await createValetSession(otherSessionFixture);
    await expectPostgresError(
      createIncident(fixture, { valetSessionId: otherSessionId }),
      "23503",
      "incidents_org_location_valet_session_id_fkey",
    );
  });

  it("rejects an Incident reporter from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createIncident(fixture, {
        reportedByMembershipId: otherFixture.membershipId,
      }),
      "23503",
      "incidents_org_reported_by_membership_id_fkey",
    );
  });

  it("rejects an Incident resolver from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createIncident(fixture, {
        resolvedByMembershipId: otherFixture.membershipId,
      }),
      "23503",
      "incidents_org_resolved_by_membership_id_fkey",
    );
  });

  it("uses RESTRICT for every Incident foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'incidents'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      { confdeltype: "r", conname: "incidents_org_location_id_fkey" },
      {
        confdeltype: "r",
        conname: "incidents_org_location_valet_session_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "incidents_org_reported_by_membership_id_fkey",
      },
      {
        confdeltype: "r",
        conname: "incidents_org_resolved_by_membership_id_fkey",
      },
      { confdeltype: "r", conname: "incidents_organization_id_fkey" },
    ]);
  });

  it.each([
    "Organization",
    "Location",
    "ValetSession",
    "ReportingMembership",
    "ResolvingMembership",
  ])("restricts deletion of an Incident %s parent", async (parent) => {
    const fixture = await createPaymentTestFixture();
    const resolver = await createStaff(fixture.organizationId);
    await createIncident(fixture, {
      resolvedByMembershipId: resolver.membershipId,
    });
    const statements: Record<string, [string, string]> = {
      Location: ["DELETE FROM locations WHERE id = $1", fixture.locationId],
      Organization: [
        "DELETE FROM organizations WHERE id = $1",
        fixture.organizationId,
      ],
      ReportingMembership: [
        "DELETE FROM organization_memberships WHERE id = $1",
        fixture.membershipId,
      ],
      ResolvingMembership: [
        "DELETE FROM organization_memberships WHERE id = $1",
        resolver.membershipId,
      ],
      ValetSession: [
        "DELETE FROM valet_sessions WHERE id = $1",
        fixture.valetSessionId,
      ],
    };
    const [statement, id] = statements[parent]!;
    await expectPostgresError(databaseClient.query(statement, [id]), "23503");
  });
});

describe("notification database foundation", () => {
  it("keeps the first fourteen forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 14)).toEqual(
      expectedMigrationDirectories.slice(0, 14),
    );
    expect(appliedMigrationDirectories.at(13)).toBe(
      "20260809001400_notification_foundation",
    );
  });

  it.each([
    ["notification_channel", ["SMS", "WHATSAPP", "EMAIL"]],
    ["notification_status", ["PENDING", "SENT", "FAILED"]],
  ])("defines exactly the documented %s enum", async (enumName, expected) => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT e.enumlabel
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = $1
       ORDER BY e.enumsortorder`,
      [enumName],
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual(expected);
  });

  it("creates exactly the documented Notification columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'notifications'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "valet_session_id",
      "channel",
      "recipient",
      "template_key",
      "status",
      "provider_reference",
      "created_at",
      "sent_at",
      "failed_at",
    ]);
  });

  it("uses the exact documented Notification types, nullability, and defaults", async () => {
    const result = await databaseClient.query<{
      column_default: string | null;
      column_name: string;
      is_nullable: string;
      udt_name: string;
    }>(
      `SELECT column_name, udt_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'notifications'
       ORDER BY ordinal_position`,
    );
    expect(result.rows).toEqual([
      {
        column_default: null,
        column_name: "id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "organization_id",
        is_nullable: "NO",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "valet_session_id",
        is_nullable: "YES",
        udt_name: "uuid",
      },
      {
        column_default: null,
        column_name: "channel",
        is_nullable: "NO",
        udt_name: "notification_channel",
      },
      {
        column_default: null,
        column_name: "recipient",
        is_nullable: "NO",
        udt_name: "text",
      },
      {
        column_default: null,
        column_name: "template_key",
        is_nullable: "NO",
        udt_name: "text",
      },
      {
        column_default: "'PENDING'::notification_status",
        column_name: "status",
        is_nullable: "NO",
        udt_name: "notification_status",
      },
      {
        column_default: null,
        column_name: "provider_reference",
        is_nullable: "YES",
        udt_name: "text",
      },
      {
        column_default: "CURRENT_TIMESTAMP",
        column_name: "created_at",
        is_nullable: "NO",
        udt_name: "timestamptz",
      },
      {
        column_default: null,
        column_name: "sent_at",
        is_nullable: "YES",
        udt_name: "timestamptz",
      },
      {
        column_default: null,
        column_name: "failed_at",
        is_nullable: "YES",
        udt_name: "timestamptz",
      },
    ]);
  });

  it("does not create provider, callback, retry, content, consent, or metadata persistence", async () => {
    const columns = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'notifications'`,
    );
    const actualColumns = columns.rows.map((row) => row.column_name);
    for (const forbidden of [
      "updated_at",
      "location_id",
      "provider",
      "message_body",
      "rendered_content",
      "raw_payload",
      "provider_event_id",
      "idempotency_key",
      "retry_count",
      "metadata",
      "metadata_json",
      "consent",
    ]) {
      expect(actualColumns).not.toContain(forbidden);
    }

    const tables = await databaseClient.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name LIKE 'notification%'
         AND table_name <> 'notifications'`,
    );
    expect(tables.rows).toEqual([]);
  });

  it("creates only the Notification primary-key index", async () => {
    const result = await databaseClient.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'notifications'
       ORDER BY indexname`,
    );
    expect(result.rows.map((row) => row.indexname)).toEqual([
      "notifications_pkey",
    ]);
  });

  it("does not create Notification database triggers", async () => {
    const result = await databaseClient.query<{ trigger_name: string }>(
      `SELECT trigger_name
       FROM information_schema.triggers
       WHERE event_object_schema = 'public'
         AND event_object_table = 'notifications'`,
    );
    expect(result.rows).toEqual([]);
  });

  it("accepts a minimal Notification and applies the PENDING default", async () => {
    const fixture = await createPaymentTestFixture();
    const notificationId = await createNotification(fixture);
    const result = await databaseClient.query<{
      provider_reference: string | null;
      status: string;
      valet_session_id: string | null;
    }>(
      `SELECT status, valet_session_id, provider_reference
       FROM notifications
       WHERE id = $1`,
      [notificationId],
    );
    expect(result.rows).toEqual([
      {
        provider_reference: null,
        status: "PENDING",
        valet_session_id: null,
      },
    ]);
  });

  it.each(["SMS", "WHATSAPP", "EMAIL"])(
    "accepts Notification channel %s",
    async (channel) => {
      const fixture = await createPaymentTestFixture();
      await expect(
        createNotification(fixture, { channel }),
      ).resolves.toBeTypeOf("string");
    },
  );

  it("accepts a same-Organization ValetSession", async () => {
    const fixture = await createPaymentTestFixture();
    await expect(
      createNotification(fixture, { valetSessionId: fixture.valetSessionId }),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts SENT with sent_at", async () => {
    const fixture = await createPaymentTestFixture();
    await expect(
      createNotification(fixture, { sentAt: new Date(), status: "SENT" }),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts FAILED with failed_at", async () => {
    const fixture = await createPaymentTestFixture();
    await expect(
      createNotification(fixture, { failedAt: new Date(), status: "FAILED" }),
    ).resolves.toBeTypeOf("string");
  });

  it("accepts a non-null provider_reference without provider coupling", async () => {
    const fixture = await createPaymentTestFixture();
    await expect(
      createNotification(fixture, { providerReference: randomUUID() }),
    ).resolves.toBeTypeOf("string");
  });

  it.each([
    [
      "PENDING with both timestamps",
      { failedAt: new Date(), sentAt: new Date() },
    ],
    [
      "SENT with failed_at also populated",
      { failedAt: new Date(), sentAt: new Date(), status: "SENT" },
    ],
    [
      "FAILED with sent_at also populated",
      { failedAt: new Date(), sentAt: new Date(), status: "FAILED" },
    ],
  ])(
    "does not enforce undocumented timestamp coupling: %s",
    async (_title, values) => {
      const fixture = await createPaymentTestFixture();
      await expect(createNotification(fixture, values)).resolves.toBeTypeOf(
        "string",
      );
    },
  );

  it("allows duplicate provider_reference values", async () => {
    const fixture = await createPaymentTestFixture();
    const providerReference = randomUUID();
    await createNotification(fixture, { providerReference });
    await expect(
      createNotification(fixture, { providerReference }),
    ).resolves.toBeTypeOf("string");
  });

  it.each([
    ["undocumented channel", { channel: "PUSH" }],
    ["undocumented status", { status: "DELIVERED" }],
  ])("rejects invalid Notification enum: %s", async (_title, values) => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(createNotification(fixture, values), "22P02");
  });

  it.each([
    ["SENT without sent_at", { status: "SENT" }],
    ["FAILED without failed_at", { status: "FAILED" }],
  ])(
    "rejects invalid Notification timestamp state: %s",
    async (_title, values) => {
      const fixture = await createPaymentTestFixture();
      await expectPostgresError(createNotification(fixture, values), "23514");
    },
  );

  it("rejects an unknown Notification Organization", async () => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(
      createNotification(fixture, { organizationId: randomUUID() }),
      "23503",
      "notifications_organization_id_fkey",
    );
  });

  it("rejects a Notification ValetSession from another Organization", async () => {
    const fixture = await createPaymentTestFixture();
    const otherFixture = await createPaymentTestFixture();
    await expectPostgresError(
      createNotification(fixture, {
        valetSessionId: otherFixture.valetSessionId,
      }),
      "23503",
      "notifications_org_valet_session_id_fkey",
    );
  });

  it("uses RESTRICT for every Notification foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype
       FROM pg_constraint
       WHERE conrelid = 'notifications'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows).toEqual([
      {
        confdeltype: "r",
        conname: "notifications_org_valet_session_id_fkey",
      },
      { confdeltype: "r", conname: "notifications_organization_id_fkey" },
    ]);
  });

  it("restricts deletion of an Organization referenced by Notification", async () => {
    const organizationId = await createOrganization();
    const fixture: PaymentFixture = {
      locationId: randomUUID(),
      membershipId: randomUUID(),
      organizationId,
      valetSessionId: randomUUID(),
    };
    await createNotification(fixture);
    await expectPostgresError(
      databaseClient.query("DELETE FROM organizations WHERE id = $1", [
        organizationId,
      ]),
      "23503",
      "notifications_organization_id_fkey",
    );
  });

  it("restricts deletion of a ValetSession referenced by Notification", async () => {
    const fixture = await createPaymentTestFixture();
    await createNotification(fixture, {
      valetSessionId: fixture.valetSessionId,
    });
    await expectPostgresError(
      databaseClient.query("DELETE FROM valet_sessions WHERE id = $1", [
        fixture.valetSessionId,
      ]),
      "23503",
      "notifications_org_valet_session_id_fkey",
    );
  });
});

describe("check-in intake persistence", () => {
  it("keeps the first fifteen forward-only migrations in order", () => {
    expect(appliedMigrationDirectories.slice(0, 15)).toEqual(
      expectedMigrationDirectories.slice(0, 15),
    );
    expect(appliedMigrationDirectories.at(14)).toBe(
      "20260809001500_check_in_intake_persistence",
    );
  });

  it("upgrades an existing fourteen-migration fixture without changing custody state or version", async () => {
    const result = await databaseClient.query<{
      check_in_condition_completed_at: Date | null;
      check_in_condition_completed_by_membership_id: string | null;
      check_in_photos_required: boolean;
      check_in_photos_required_override: boolean | null;
      state: string;
      version: number;
    }>(
      `SELECT
         organization.check_in_photos_required,
         location.check_in_photos_required_override,
         session.check_in_condition_completed_at,
         session.check_in_condition_completed_by_membership_id,
         session.state::text,
         session.version
       FROM organizations AS organization
       INNER JOIN locations AS location
         ON location.organization_id = organization.id
       INNER JOIN valet_sessions AS session
         ON session.organization_id = organization.id
        AND session.location_id = location.id
       WHERE organization.id = $1
         AND location.id = $2
         AND session.id = $3`,
      [
        incrementalMigrationFixture.organizationId,
        incrementalMigrationFixture.locationId,
        incrementalMigrationFixture.valetSessionId,
      ],
    );

    expect(result.rows[0]).toEqual({
      check_in_condition_completed_at: null,
      check_in_condition_completed_by_membership_id: null,
      check_in_photos_required: false,
      check_in_photos_required_override: null,
      state: "CHECKING_IN",
      version: 1,
    });
  });

  it.each([
    ["condition_evidence_context", ["CHECK_IN"]],
    ["vehicle_photo_purpose", ["CHECK_IN_CONDITION"]],
  ])("defines exactly the focused %s enum", async (enumName, expected) => {
    const result = await databaseClient.query<{ enumlabel: string }>(
      `SELECT value.enumlabel
       FROM pg_enum AS value
       INNER JOIN pg_type AS type ON type.oid = value.enumtypid
       WHERE type.typname = $1
       ORDER BY value.enumsortorder`,
      [enumName],
    );
    expect(result.rows.map((row) => row.enumlabel)).toEqual(expected);
  });

  it("creates only private relational VehiclePhoto metadata", async () => {
    const result = await databaseClient.query<{
      column_name: string;
      data_type: string;
    }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'vehicle_photos'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "id",
      "organization_id",
      "location_id",
      "valet_session_id",
      "captured_by_membership_id",
      "purpose",
      "storage_object_key",
      "content_type",
      "created_at",
    ]);
    expect(result.rows.some((row) => row.data_type === "bytea")).toBe(false);
    expect(
      result.rows.some((row) =>
        /(^vehicle_id$|url|binary|blob|data)/i.test(row.column_name),
      ),
    ).toBe(false);
  });

  it("persists a valid CHECK_IN ConditionNote in the correct session and actor scope", async () => {
    const fixture = await createCheckInIntakeFixture();
    const noteId = await createConditionNote(fixture, {
      content: "Small existing mark on rear bumper",
    });
    const result = await databaseClient.query<{
      content: string;
      context: string;
      created_at: Date;
      location_id: string;
      organization_id: string;
      recorded_by_membership_id: string;
      valet_session_id: string;
    }>(
      `SELECT organization_id, location_id, valet_session_id,
              context::text, content, recorded_by_membership_id, created_at
       FROM condition_notes
       WHERE id = $1`,
      [noteId],
    );
    expect(result.rows[0]).toMatchObject({
      content: "Small existing mark on rear bumper",
      context: "CHECK_IN",
      location_id: fixture.locationId,
      organization_id: fixture.organizationId,
      recorded_by_membership_id: fixture.checkedInByMembershipId,
      valet_session_id: fixture.valetSessionId,
    });
    expect(result.rows[0]?.created_at).toBeInstanceOf(Date);
  });

  it("rejects blank ConditionNote evidence", async () => {
    const fixture = await createCheckInIntakeFixture();
    await expectPostgresError(
      createConditionNote(fixture, { content: "   " }),
      "23514",
      "condition_notes_content_check",
    );
  });

  it("rejects cross-tenant, cross-location, and foreign-actor ConditionNote relationships", async () => {
    const fixture = await createCheckInIntakeFixture();
    const foreignTenantFixture = await createCheckInIntakeFixture();
    const otherLocationId = await createLocation(fixture.organizationId);
    const otherLocationFixture = await createCheckInIntakeFixture({
      locationId: otherLocationId,
      organizationId: fixture.organizationId,
    });
    const foreignActor = await createStaff(foreignTenantFixture.organizationId);

    await expectPostgresError(
      createConditionNote(fixture, {
        valetSessionId: foreignTenantFixture.valetSessionId,
      }),
      "23503",
      "condition_notes_org_location_session_id_fkey",
    );
    await expectPostgresError(
      createConditionNote(fixture, {
        valetSessionId: otherLocationFixture.valetSessionId,
      }),
      "23503",
      "condition_notes_org_location_session_id_fkey",
    );
    await expectPostgresError(
      createConditionNote(fixture, {
        recordedByMembershipId: foreignActor.membershipId,
      }),
      "23503",
      "condition_notes_org_recorded_by_membership_id_fkey",
    );
  });

  it("appends a same-session correction while preserving the original note", async () => {
    const fixture = await createCheckInIntakeFixture();
    const originalId = await createConditionNote(fixture, {
      content: "Initial condition observation",
    });
    const correctionId = await createConditionNote(fixture, {
      content: "Corrected condition observation",
      supersedesConditionNoteId: originalId,
    });
    const result = await databaseClient.query<{
      content: string;
      id: string;
      supersedes_condition_note_id: string | null;
    }>(
      `SELECT id::text, content, supersedes_condition_note_id::text
       FROM condition_notes
       WHERE id IN ($1, $2)`,
      [originalId, correctionId],
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows).toContainEqual({
      content: "Initial condition observation",
      id: originalId,
      supersedes_condition_note_id: null,
    });
    expect(result.rows).toContainEqual({
      content: "Corrected condition observation",
      id: correctionId,
      supersedes_condition_note_id: originalId,
    });
  });

  it("rejects ConditionNote correction lineage across sessions and tenants", async () => {
    const fixture = await createCheckInIntakeFixture();
    const originalId = await createConditionNote(fixture);
    const sameTenantOtherSession = await createCheckInIntakeFixture({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    });
    const foreignTenantSession = await createCheckInIntakeFixture();

    await expectPostgresError(
      createConditionNote(sameTenantOtherSession, {
        supersedesConditionNoteId: originalId,
      }),
      "23503",
      "condition_notes_scope_supersedes_id_fkey",
    );
    await expectPostgresError(
      createConditionNote(foreignTenantSession, {
        supersedesConditionNoteId: originalId,
      }),
      "23503",
      "condition_notes_scope_supersedes_id_fkey",
    );
  });

  it("makes condition completion deterministic while preserving session state and version", async () => {
    const fixture = await createCheckInIntakeFixture();
    const before = await databaseClient.query<{
      complete: boolean;
    }>(
      `SELECT (
         check_in_condition_completed_at IS NOT NULL
         AND check_in_condition_completed_by_membership_id IS NOT NULL
       ) AS complete
       FROM valet_sessions WHERE id = $1`,
      [fixture.valetSessionId],
    );
    expect(before.rows[0]?.complete).toBe(false);

    const completedAt = new Date();
    await databaseClient.query(
      `UPDATE valet_sessions
       SET check_in_condition_completed_at = $1,
           check_in_condition_completed_by_membership_id = $2
       WHERE id = $3`,
      [completedAt, fixture.checkedInByMembershipId, fixture.valetSessionId],
    );
    const after = await databaseClient.query<{
      complete: boolean;
      state: string;
      version: number;
    }>(
      `SELECT (
         check_in_condition_completed_at IS NOT NULL
         AND check_in_condition_completed_by_membership_id IS NOT NULL
       ) AS complete, state::text, version
       FROM valet_sessions WHERE id = $1`,
      [fixture.valetSessionId],
    );
    expect(after.rows[0]).toEqual({
      complete: true,
      state: "CHECKING_IN",
      version: 1,
    });
  });

  it("rejects half-populated condition completion and a foreign-tenant completion actor", async () => {
    const timestampOnly = await createCheckInIntakeFixture();
    const actorOnly = await createCheckInIntakeFixture();
    const foreignActorFixture = await createCheckInIntakeFixture();

    await expectPostgresError(
      databaseClient.query(
        `UPDATE valet_sessions
         SET check_in_condition_completed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [timestampOnly.valetSessionId],
      ),
      "23514",
      "valet_sessions_check_in_condition_completion_pair_check",
    );
    await expectPostgresError(
      databaseClient.query(
        `UPDATE valet_sessions
         SET check_in_condition_completed_by_membership_id = $1
         WHERE id = $2`,
        [actorOnly.checkedInByMembershipId, actorOnly.valetSessionId],
      ),
      "23514",
      "valet_sessions_check_in_condition_completion_pair_check",
    );
    await expectPostgresError(
      databaseClient.query(
        `UPDATE valet_sessions
         SET check_in_condition_completed_at = CURRENT_TIMESTAMP,
             check_in_condition_completed_by_membership_id = $1
         WHERE id = $2`,
        [
          foreignActorFixture.checkedInByMembershipId,
          timestampOnly.valetSessionId,
        ],
      ),
      "23503",
      "valet_sessions_org_condition_completed_by_id_fkey",
    );
  });

  it("persists private CHECK_IN_CONDITION metadata and derives Vehicle from ValetSession", async () => {
    const fixture = await createCheckInIntakeFixture();
    const storageObjectKey = `private/check-in/${randomUUID()}`;
    const photoId = await createVehiclePhoto(fixture, { storageObjectKey });
    const result = await databaseClient.query<{
      captured_by_membership_id: string;
      content_type: string;
      purpose: string;
      storage_object_key: string;
      vehicle_id: string;
    }>(
      `SELECT photo.captured_by_membership_id,
              photo.purpose::text,
              photo.storage_object_key,
              photo.content_type,
              session.vehicle_id
       FROM vehicle_photos AS photo
       INNER JOIN valet_sessions AS session
         ON session.organization_id = photo.organization_id
        AND session.location_id = photo.location_id
        AND session.id = photo.valet_session_id
       WHERE photo.id = $1`,
      [photoId],
    );
    expect(result.rows[0]).toEqual({
      captured_by_membership_id: fixture.checkedInByMembershipId,
      content_type: "image/jpeg",
      purpose: "CHECK_IN_CONDITION",
      storage_object_key: storageObjectKey,
      vehicle_id: fixture.vehicleId,
    });
  });

  it("rejects blank VehiclePhoto object keys and content types", async () => {
    const fixture = await createCheckInIntakeFixture();
    await expectPostgresError(
      createVehiclePhoto(fixture, { storageObjectKey: "   " }),
      "23514",
      "vehicle_photos_storage_object_key_check",
    );
    await expectPostgresError(
      createVehiclePhoto(fixture, { contentType: "   " }),
      "23514",
      "vehicle_photos_content_type_check",
    );
  });

  it("rejects cross-tenant, cross-location, and foreign-actor VehiclePhoto relationships", async () => {
    const fixture = await createCheckInIntakeFixture();
    const foreignTenantFixture = await createCheckInIntakeFixture();
    const otherLocationId = await createLocation(fixture.organizationId);
    const otherLocationFixture = await createCheckInIntakeFixture({
      locationId: otherLocationId,
      organizationId: fixture.organizationId,
    });
    const foreignActor = await createStaff(foreignTenantFixture.organizationId);

    await expectPostgresError(
      createVehiclePhoto(fixture, {
        valetSessionId: foreignTenantFixture.valetSessionId,
      }),
      "23503",
      "vehicle_photos_org_location_session_id_fkey",
    );
    await expectPostgresError(
      createVehiclePhoto(fixture, {
        valetSessionId: otherLocationFixture.valetSessionId,
      }),
      "23503",
      "vehicle_photos_org_location_session_id_fkey",
    );
    await expectPostgresError(
      createVehiclePhoto(fixture, {
        capturedByMembershipId: foreignActor.membershipId,
      }),
      "23503",
      "vehicle_photos_org_captured_by_membership_id_fkey",
    );
  });

  it.each([
    [false, null, false],
    [true, null, true],
    [false, true, true],
    [true, false, false],
  ])(
    "resolves Organization photo default %s with Location override %s to %s",
    async (organizationDefault, locationOverride, expected) => {
      const tenant = await createTenant();
      await databaseClient.query(
        `UPDATE organizations
         SET check_in_photos_required = $1
         WHERE id = $2`,
        [organizationDefault, tenant.organizationId],
      );
      await databaseClient.query(
        `UPDATE locations
         SET check_in_photos_required_override = $1
         WHERE id = $2`,
        [locationOverride, tenant.locationId],
      );
      const result = await databaseClient.query<{ effective: boolean }>(
        `SELECT COALESCE(
           location.check_in_photos_required_override,
           organization.check_in_photos_required
         ) AS effective
         FROM locations AS location
         INNER JOIN organizations AS organization
           ON organization.id = location.organization_id
         WHERE location.id = $1`,
        [tenant.locationId],
      );
      expect(result.rows[0]?.effective).toBe(expected);
    },
  );

  it("uses restrictive tenant-safe foreign keys for intake evidence", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      confupdtype: string;
      conname: string;
      table_name: string;
    }>(
      `SELECT constraint_record.conname,
              constraint_record.confdeltype,
              constraint_record.confupdtype,
              table_record.relname AS table_name
       FROM pg_constraint AS constraint_record
       INNER JOIN pg_class AS table_record
         ON table_record.oid = constraint_record.conrelid
       WHERE constraint_record.contype = 'f'
         AND table_record.relname IN ('condition_notes', 'vehicle_photos')
       ORDER BY table_record.relname, constraint_record.conname`,
    );
    expect(result.rows).toHaveLength(9);
    expect(result.rows.every((row) => row.confdeltype === "r")).toBe(true);
    expect(result.rows.every((row) => row.confupdtype === "r")).toBe(true);
    expect(result.rows.map((row) => row.conname)).toEqual([
      "condition_notes_org_location_id_fkey",
      "condition_notes_org_location_session_id_fkey",
      "condition_notes_org_recorded_by_membership_id_fkey",
      "condition_notes_organization_id_fkey",
      "condition_notes_scope_supersedes_id_fkey",
      "vehicle_photos_org_captured_by_membership_id_fkey",
      "vehicle_photos_org_location_id_fkey",
      "vehicle_photos_org_location_session_id_fkey",
      "vehicle_photos_organization_id_fkey",
    ]);
  });
});

describe("intake session creation persistence", () => {
  it("applies exactly all thirty-six forward-only migrations in order", () => {
    expect(appliedMigrationDirectories).toEqual(expectedMigrationDirectories);
    expect(appliedMigrationDirectories.at(-1)).toBe(
      "20260916003600_mgt_be_02_complete_mfa",
    );
  });

  it("creates only the scoped durable intake operation columns", async () => {
    const result = await databaseClient.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'intake_operations'
       ORDER BY ordinal_position`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "organization_id",
      "operation_key",
      "request_fingerprint",
      "location_id",
      "valet_session_id",
      "created_at",
    ]);
  });

  it("uses the organization-scoped key and one operation per created session", async () => {
    const result = await databaseClient.query<{
      indexdef: string;
      indexname: string;
    }>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'intake_operations'
       ORDER BY indexname`,
    );
    expect(result.rows.map((row) => row.indexname)).toEqual([
      "intake_operations_pkey",
      "intake_operations_valet_session_id_key",
    ]);
    expect(result.rows[0]?.indexdef).toContain(
      "(organization_id, operation_key)",
    );
    expect(result.rows[1]?.indexdef).toContain("(valet_session_id)");
  });

  it("enforces operation-key and fingerprint checks", async () => {
    const fixture = await createPaymentTestFixture();
    await expectPostgresError(
      databaseClient.query(
        `INSERT INTO intake_operations
           (organization_id, operation_key, request_fingerprint, location_id,
            valet_session_id)
         VALUES ($1, 'short', $2, $3, $4)`,
        [
          fixture.organizationId,
          "a".repeat(64),
          fixture.locationId,
          fixture.valetSessionId,
        ],
      ),
      "23514",
      "intake_operations_operation_key_check",
    );
    await expectPostgresError(
      databaseClient.query(
        `INSERT INTO intake_operations
           (organization_id, operation_key, request_fingerprint, location_id,
            valet_session_id)
         VALUES ($1, $2, 'not-a-digest', $3, $4)`,
        [
          fixture.organizationId,
          `op:${randomUUID()}`,
          fixture.locationId,
          fixture.valetSessionId,
        ],
      ),
      "23514",
      "intake_operations_request_fingerprint_check",
    );
  });

  it("scopes operation keys to Organization and rejects duplicate session results", async () => {
    const first = await createPaymentTestFixture();
    const second = await createPaymentTestFixture();
    const operationKey = `op:${randomUUID()}`;
    const insert = (fixture: PaymentFixture, key = operationKey) =>
      databaseClient.query(
        `INSERT INTO intake_operations
           (organization_id, operation_key, request_fingerprint, location_id,
            valet_session_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          fixture.organizationId,
          key,
          "a".repeat(64),
          fixture.locationId,
          fixture.valetSessionId,
        ],
      );

    await insert(first);
    await expectPostgresError(insert(first), "23505", "intake_operations_pkey");
    await expect(insert(second)).resolves.toBeDefined();
    await expectPostgresError(
      insert(first, `op:${randomUUID()}`),
      "23505",
      "intake_operations_valet_session_id_key",
    );
  });

  it("rejects a session outside the persisted Organization and Location scope", async () => {
    const first = await createPaymentTestFixture();
    const second = await createPaymentTestFixture();
    await expectPostgresError(
      databaseClient.query(
        `INSERT INTO intake_operations
           (organization_id, operation_key, request_fingerprint, location_id,
            valet_session_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          first.organizationId,
          `op:${randomUUID()}`,
          "b".repeat(64),
          first.locationId,
          second.valetSessionId,
        ],
      ),
      "23503",
      "intake_operations_org_location_session_id_fkey",
    );
  });

  it("uses RESTRICT for every intake operation foreign key", async () => {
    const result = await databaseClient.query<{
      confdeltype: string;
      confupdtype: string;
      conname: string;
    }>(
      `SELECT conname, confdeltype, confupdtype
       FROM pg_constraint
       WHERE conrelid = 'intake_operations'::regclass AND contype = 'f'
       ORDER BY conname`,
    );
    expect(result.rows.map((row) => row.conname)).toEqual([
      "intake_operations_org_location_id_fkey",
      "intake_operations_org_location_session_id_fkey",
      "intake_operations_organization_id_fkey",
    ]);
    expect(result.rows.every((row) => row.confdeltype === "r")).toBe(true);
    expect(result.rows.every((row) => row.confupdtype === "r")).toBe(true);
  });

  it("does not backfill an operation for a pre-existing session", async () => {
    const result = await databaseClient.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM intake_operations
       WHERE valet_session_id = $1`,
      [incrementalMigrationFixture.valetSessionId],
    );
    expect(result.rows[0]?.count).toBe(0);
  });
});

describe("staff authentication persistence", () => {
  async function createStaffAuthSessionFixture(): Promise<{
    refreshId: string;
    sessionId: string;
  }> {
    const userId = await createUser();
    const sessionId = randomUUID();
    const refreshId = randomUUID();
    const accessHash = `staff-access-sha256:v1:${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
    const refreshHash = `staff-refresh-sha256:v1:${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
    await databaseClient.query(
      `INSERT INTO staff_auth_sessions (
         id, user_id, current_access_token_hash, access_expires_at,
         absolute_expires_at, created_at, last_rotated_at
       ) VALUES (
         $1, $2, $3, TIMESTAMPTZ '2026-01-01 00:15:00+00',
         TIMESTAMPTZ '2026-01-31 00:00:00+00',
         TIMESTAMPTZ '2026-01-01 00:00:00+00',
         TIMESTAMPTZ '2026-01-01 00:00:00+00'
       )`,
      [sessionId, userId, accessHash],
    );
    await databaseClient.query(
      `INSERT INTO staff_refresh_credentials (
         id, session_id, token_hash, generation, created_at, expires_at
       ) VALUES (
         $1, $2, $3, 1,
         TIMESTAMPTZ '2026-01-01 00:00:00+00',
         TIMESTAMPTZ '2026-01-31 00:00:00+00'
       )`,
      [refreshId, sessionId, refreshHash],
    );
    return { refreshId, sessionId };
  }
  it("creates only the accepted session and refresh credential columns", async () => {
    const result = await databaseClient.query<{
      column_name: string;
      table_name: string;
    }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('staff_auth_sessions', 'staff_refresh_credentials')
       ORDER BY table_name, ordinal_position`,
    );
    expect(result.rows).toEqual([
      { column_name: "id", table_name: "staff_auth_sessions" },
      { column_name: "user_id", table_name: "staff_auth_sessions" },
      {
        column_name: "current_access_token_hash",
        table_name: "staff_auth_sessions",
      },
      { column_name: "access_expires_at", table_name: "staff_auth_sessions" },
      { column_name: "absolute_expires_at", table_name: "staff_auth_sessions" },
      { column_name: "revoked_at", table_name: "staff_auth_sessions" },
      { column_name: "created_at", table_name: "staff_auth_sessions" },
      { column_name: "last_rotated_at", table_name: "staff_auth_sessions" },
      {
        column_name: "mfa_authenticated_at",
        table_name: "staff_auth_sessions",
      },
      { column_name: "mfa_factor_id", table_name: "staff_auth_sessions" },
      {
        column_name: "last_admin_activity_at",
        table_name: "staff_auth_sessions",
      },
      { column_name: "id", table_name: "staff_refresh_credentials" },
      { column_name: "session_id", table_name: "staff_refresh_credentials" },
      { column_name: "token_hash", table_name: "staff_refresh_credentials" },
      { column_name: "generation", table_name: "staff_refresh_credentials" },
      { column_name: "created_at", table_name: "staff_refresh_credentials" },
      { column_name: "expires_at", table_name: "staff_refresh_credentials" },
      { column_name: "consumed_at", table_name: "staff_refresh_credentials" },
      {
        column_name: "replaced_by_credential_id",
        table_name: "staff_refresh_credentials",
      },
    ]);
  });
  it("enforces one current refresh credential and restrictive foreign keys", async () => {
    const indexes = await databaseClient.query<{
      indexdef: string;
      indexname: string;
    }>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'staff_refresh_credentials'
       ORDER BY indexname`,
    );
    expect(
      indexes.rows.find(
        (row) =>
          row.indexname ===
          "staff_refresh_credentials_one_current_per_session_key",
      )?.indexdef,
    ).toContain("WHERE (consumed_at IS NULL)");

    const foreignKeys = await databaseClient.query<{
      confdeltype: string;
      confupdtype: string;
    }>(
      `SELECT confdeltype, confupdtype
       FROM pg_constraint AS constraint_record
       INNER JOIN pg_class AS table_record
         ON table_record.oid = constraint_record.conrelid
       WHERE constraint_record.contype = 'f'
         AND table_record.relname IN ('staff_auth_sessions', 'staff_refresh_credentials')`,
    );
    expect(foreignKeys.rows).toHaveLength(4);
    expect(foreignKeys.rows.every((row) => row.confdeltype === "r")).toBe(true);
    expect(foreignKeys.rows.every((row) => row.confupdtype === "r")).toBe(true);
  });
  it("rejects invalid staff session timestamp insert and update orderings", async () => {
    const userId = await createUser();
    await expectPostgresError(
      databaseClient.query(
        `INSERT INTO staff_auth_sessions (
           id, user_id, current_access_token_hash, access_expires_at,
           absolute_expires_at, revoked_at, created_at, last_rotated_at
         ) VALUES (
           $1, $2, $3,
           TIMESTAMPTZ '2026-01-01 00:00:00+00',
           TIMESTAMPTZ '2026-01-31 00:00:00+00',
           TIMESTAMPTZ '2025-12-31 23:59:59+00',
           TIMESTAMPTZ '2026-01-01 00:00:00+00',
           TIMESTAMPTZ '2025-12-31 23:59:59+00'
         )`,
        [randomUUID(), userId, `staff-access-sha256:v1:${"a".repeat(64)}`],
      ),
      "23514",
      "staff_auth_sessions_expiry_check",
    );

    const fixture = await createStaffAuthSessionFixture();
    for (const update of [
      `access_expires_at = created_at`,
      `absolute_expires_at = created_at`,
      `last_rotated_at = created_at - INTERVAL '1 millisecond'`,
      `revoked_at = created_at - INTERVAL '1 millisecond'`,
    ]) {
      await expectPostgresError(
        databaseClient.query(
          `UPDATE staff_auth_sessions SET ${update} WHERE id = $1`,
          [fixture.sessionId],
        ),
        "23514",
        "staff_auth_sessions_expiry_check",
      );
    }
  });

  it("rejects invalid refresh expiry and consumption timestamp orderings", async () => {
    const fixture = await createStaffAuthSessionFixture();
    await expectPostgresError(
      databaseClient.query(
        `UPDATE staff_refresh_credentials
         SET expires_at = created_at
         WHERE id = $1`,
        [fixture.refreshId],
      ),
      "23514",
      "staff_refresh_credentials_expiry_check",
    );
    for (const consumedAt of [
      `created_at - INTERVAL '1 millisecond'`,
      `expires_at + INTERVAL '1 millisecond'`,
    ]) {
      await expectPostgresError(
        databaseClient.query(
          `UPDATE staff_refresh_credentials
           SET consumed_at = ${consumedAt}
           WHERE id = $1`,
          [fixture.refreshId],
        ),
        "23514",
        "staff_refresh_credentials_expiry_check",
      );
    }
  });

  it("enforces the DEC-024 anti-abuse persistence contract", async () => {
    const columns = await databaseClient.query<{
      column_default: string | null;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'anti_abuse_events'
       ORDER BY ordinal_position`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "id",
      "scope",
      "key_hash",
      "occurred_at",
      "state",
    ]);
    expect(columns.rows.every((row) => row.is_nullable === "NO")).toBe(true);
    expect(
      columns.rows.find((row) => row.column_name === "id")?.column_default,
    ).toContain("gen_random_uuid");
    expect(
      columns.rows.find((row) => row.column_name === "occurred_at")
        ?.column_default,
    ).toContain("clock_timestamp");

    const indexes = await databaseClient.query<{
      indexdef: string;
      indexname: string;
    }>(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'anti_abuse_events'`,
    );
    expect(
      indexes.rows.find(
        (row) =>
          row.indexname === "anti_abuse_events_scope_key_hash_occurred_at_idx",
      )?.indexdef,
    ).toContain("(scope, key_hash, occurred_at)");

    const validHash = `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`;
    await databaseClient.query(
      `INSERT INTO anti_abuse_events (scope, key_hash, state)
       VALUES ('v1:guest-token', $1, 'COUNTED')`,
      [validHash],
    );
    for (const [scope, hash, state, constraint] of [
      ["v2:guest-token", validHash, "COUNTED", "anti_abuse_events_scope_check"],
      [
        "v1:guest-token",
        "raw-token",
        "COUNTED",
        "anti_abuse_events_key_hash_check",
      ],
      ["v1:guest-token", validHash, "FAILED", "anti_abuse_events_state_check"],
    ] as const) {
      await expectPostgresError(
        databaseClient.query(
          `INSERT INTO anti_abuse_events (scope, key_hash, state)
           VALUES ($1, $2, $3)`,
          [scope, hash, state],
        ),
        "23514",
        constraint,
      );
    }

    const cleanup = await databaseClient.query<{
      proargtypes: string;
      prosecdef: boolean;
    }>(
      `SELECT proargtypes::text, prosecdef
       FROM pg_proc
       WHERE proname = 'cleanup_expired_anti_abuse_events'`,
    );
    expect(cleanup.rows).toEqual([{ proargtypes: "", prosecdef: true }]);
  });
});

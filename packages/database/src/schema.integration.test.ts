import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

interface ParkingSpotValues {
  code?: string;
  label?: string;
  status?: string;
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
  parkingSpotId?: string | null;
  state?: string;
  version?: number;
}

const adminDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const testDatabaseName = `valet_002b_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);

let databaseCreated = false;
let databaseClient: Client;

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

async function applyMigrations(client: Client): Promise<void> {
  const migrationDirectories = (
    await readdir(migrationsPath, { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationDirectory of migrationDirectories) {
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

async function createParkingSpot(
  tenant: TenantFixture,
  values: ParkingSpotValues = {},
): Promise<string> {
  const id = randomUUID();
  const {
    code = `SPOT-${randomUUID()}`,
    label = "Parking Spot",
    status,
  } = values;

  if (status === undefined) {
    await databaseClient.query(
      `INSERT INTO parking_spots (
         id, organization_id, location_id, code, label, updated_at
       ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [id, tenant.organizationId, tenant.locationId, code, label],
    );
  } else {
    await databaseClient.query(
      `INSERT INTO parking_spots (
         id, organization_id, location_id, code, label, status, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [id, tenant.organizationId, tenant.locationId, code, label, status],
    );
  }
  return id;
}

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
  expect(testDatabaseName).toMatch(/^valet_002b_\d+_\d+$/);

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
      "valet_sessions_org_location_parking_spot_id_fkey",
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
      "valet_sessions_org_location_parking_spot_id_fkey",
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
        "valet_sessions_org_location_parking_spot_id_fkey",
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
      "valet_sessions_active_parking_spot_id_key",
    );
  });

  it("does not reserve ParkingSpot occupancy after completion", async () => {
    const tenant = await createTenant();
    const parkingSpotId = await createParkingSpot(tenant);
    await createValetSession(await createValetSessionFixture(tenant), {
      completedAt: new Date(),
      parkingSpotId,
      state: "COMPLETED",
    });

    await expect(
      createValetSession(await createValetSessionFixture(tenant), {
        parkingSpotId,
        state: "PARKING",
      }),
    ).resolves.toBeTypeOf("string");
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
      "valet_sessions_active_key_slot_id_key",
    );
  });

  it("does not reserve KeySlot occupancy after completion", async () => {
    const tenant = await createTenant();
    const keySlotId = await createKeySlot(tenant);
    await createValetSession(await createValetSessionFixture(tenant), {
      completedAt: new Date(),
      keySlotId,
      state: "COMPLETED",
    });

    await expect(
      createValetSession(await createValetSessionFixture(tenant), {
        keySlotId,
        state: "CHECKING_IN",
      }),
    ).resolves.toBeTypeOf("string");
  });
});

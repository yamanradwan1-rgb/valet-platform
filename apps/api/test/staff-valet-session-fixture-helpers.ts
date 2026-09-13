import { randomUUID } from "node:crypto";
import type { ShiftFixture } from "./shift-test-context";
import type { ShiftTestContext } from "./shift-test-context";

export interface SessionFixtureOptions {
  checkInConditionCompletedAt?: Date | null;
  keySlotId?: string | null;
  parkedAt?: Date | null;
  parkingSpotId?: string | null;
  parkingStartedAt?: Date | null;
  parkingZoneId?: string | null;
  state?: string;
  vehicleId?: string;
  version?: number;
}

export async function createSessionHelper(
  context: ShiftTestContext,
  fixture: ShiftFixture,
  vehicleId: string,
  options: SessionFixtureOptions = {},
): Promise<string> {
  const sessionId = randomUUID();
  const state = options.state ?? "CHECKING_IN";
  const conditionCompletedAt =
    options.checkInConditionCompletedAt !== undefined
      ? options.checkInConditionCompletedAt
      : state === "CHECKING_IN"
        ? null
        : new Date();
  const conditionCompletedBy =
    conditionCompletedAt === null ? null : fixture.membershipId;
  await context.adminPool.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, check_in_condition_completed_at,
        check_in_condition_completed_by_membership_id,
        key_slot_id, parking_spot_id, parking_zone_id,
        parking_started_at, parked_at, version, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
             $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             transaction_timestamp())`,
    [
      sessionId,
      `hash:${sessionId}`,
      fixture.organizationId,
      fixture.locationId,
      vehicleId,
      state,
      fixture.membershipId,
      conditionCompletedAt,
      conditionCompletedBy,
      options.keySlotId ?? null,
      options.parkingSpotId ?? null,
      options.parkingZoneId ?? null,
      options.parkingStartedAt ?? null,
      options.parkedAt ?? null,
      options.version ?? 1,
    ],
  );
  return sessionId;
}

export async function addMemberHelper(
  context: ShiftTestContext,
  fixture: ShiftFixture,
  role:
    | "ORG_ADMIN"
    | "LOCATION_MANAGER"
    | "VALET_SUPERVISOR"
    | "VALET_EMPLOYEE" = "VALET_EMPLOYEE",
  startShift = true,
): Promise<{ membershipId: string; userId: string }> {
  const member = { membershipId: randomUUID(), userId: randomUUID() };
  const identity = randomUUID();
  await context.adminPool.query(
    `INSERT INTO users (id, email, password_hash, status, updated_at)
     VALUES ($1, $2, 'not-real', 'ACTIVE', transaction_timestamp())`,
    [member.userId, `${identity}@staff.test`],
  );
  await context.adminPool.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
    [member.membershipId, fixture.organizationId, member.userId, role],
  );
  await context.adminPool.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [fixture.organizationId, member.membershipId, fixture.locationId],
  );
  if (startShift) {
    await context.adminPool.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        member.membershipId,
      ],
    );
  }
  return member;
}

export async function createKeySlotHelper(
  context: ShiftTestContext,
  fixture: ShiftFixture,
  code = "SLOT-01",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  locationIdOverride?: string,
): Promise<string> {
  const id = randomUUID();
  await context.adminPool.query(
    `INSERT INTO key_slots (id, organization_id, location_id, code, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
    [
      id,
      fixture.organizationId,
      locationIdOverride ?? fixture.locationId,
      code,
      status,
    ],
  );
  return id;
}

export async function createParkingSpotHelper(
  context: ShiftTestContext,
  fixture: ShiftFixture,
  zoneId: string,
  code = "SPOT-01",
  locationIdOverride?: string,
): Promise<string> {
  const id = randomUUID();
  await context.adminPool.query(
    `INSERT INTO parking_spots
       (id, organization_id, location_id, parking_zone_id, code, label, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', transaction_timestamp())`,
    [
      id,
      fixture.organizationId,
      locationIdOverride ?? fixture.locationId,
      zoneId,
      code,
      `Spot ${code}`,
    ],
  );
  return id;
}

export async function createParkingZoneHelper(
  context: ShiftTestContext,
  fixture: ShiftFixture,
  code = "ZONE-01",
  locationIdOverride?: string,
): Promise<string> {
  const id = randomUUID();
  await context.adminPool.query(
    `INSERT INTO parking_zones
       (id, organization_id, location_id, code, label, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE', transaction_timestamp())`,
    [
      id,
      fixture.organizationId,
      locationIdOverride ?? fixture.locationId,
      code,
      `Zone ${code}`,
    ],
  );
  return id;
}

export async function createVehicleHelper(
  context: ShiftTestContext,
  fixture: ShiftFixture,
  options: {
    color?: string | null;
    make?: string | null;
    model?: string | null;
    plateCountry?: string | null;
    plateNumberNormalized?: string | null;
    plateNumberRaw?: string | null;
    temporaryDescriptor?: string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const plateNumberNormalized =
    options.plateNumberNormalized ??
    (options.plateNumberRaw
      ? options.plateNumberRaw.replace(/[\s\p{Pd}._/\\]+/gu, "").toUpperCase()
      : null);
  await context.adminPool.query(
    `INSERT INTO vehicles
       (id, organization_id, plate_country, plate_number_raw,
        plate_number_normalized, temporary_descriptor, make, model, color, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, transaction_timestamp())`,
    [
      id,
      fixture.organizationId,
      options.plateCountry ?? null,
      options.plateNumberRaw ?? null,
      plateNumberNormalized,
      options.temporaryDescriptor ?? null,
      options.make ?? null,
      options.model ?? null,
      options.color ?? null,
    ],
  );
  return id;
}

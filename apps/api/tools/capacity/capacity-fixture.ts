import type { Pool, PoolClient } from "pg";

export const CAPACITY_COHORT = {
  employeesPerLocation: 2,
  locations: 10,
  tasksPerLocation: 50,
} as const;

const organizationId = "025a0000-0000-4000-8000-000000000000";

export function capacityFixtureId(group: number, index: number): string {
  return `025a0000-0000-4000-8000-${group
    .toString(16)
    .padStart(2, "0")}${index.toString(16).padStart(10, "0")}`;
}

export interface CapacityFixtureClient {
  readonly allowedSessionIds: readonly string[];
  readonly email: string;
  readonly locationId: string;
  readonly sentinelSessionId: string;
}

export interface CapacityFixture {
  readonly clients: CapacityFixtureClient[];
  readonly organizationId: string;
}

async function insertLocation(
  transaction: PoolClient,
  locationIndex: number,
): Promise<void> {
  await transaction.query(
    `INSERT INTO locations
       (id, organization_id, name, code, address_text, timezone, currency,
        status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Synthetic local capacity fixture', 'UTC',
             'JOD', 'ACTIVE', now(), now())`,
    [
      capacityFixtureId(1, locationIndex),
      organizationId,
      `MOB-025A Location ${locationIndex + 1}`,
      `M25-${String(locationIndex + 1).padStart(2, "0")}`,
    ],
  );
}

async function insertEmployee(
  transaction: PoolClient,
  passwordHash: string,
  locationIndex: number,
  employeeIndex: number,
): Promise<CapacityFixtureClient> {
  const globalIndex =
    locationIndex * CAPACITY_COHORT.employeesPerLocation + employeeIndex;
  const userId = capacityFixtureId(2, globalIndex);
  const membershipId = capacityFixtureId(3, globalIndex);
  const locationId = capacityFixtureId(1, locationIndex);
  const email = `mob025a-l${locationIndex + 1}-e${employeeIndex + 1}@synthetic.invalid`;
  await transaction.query(
    `INSERT INTO users
       (id, email, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'ACTIVE', now(), now())`,
    [userId, email, passwordHash],
  );
  await transaction.query(
    `INSERT INTO organization_memberships
       (id, organization_id, user_id, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'VALET_EMPLOYEE', 'ACTIVE', now(), now())`,
    [membershipId, organizationId, userId],
  );
  await transaction.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id)
     VALUES ($1, $2, $3)`,
    [organizationId, membershipId, locationId],
  );
  await transaction.query(
    `INSERT INTO shifts
       (id, organization_id, location_id, membership_id, status, started_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', now() - interval '1 hour')`,
    [
      capacityFixtureId(4, globalIndex),
      organizationId,
      locationId,
      membershipId,
    ],
  );
  return {
    allowedSessionIds: Array.from(
      { length: CAPACITY_COHORT.tasksPerLocation },
      (_, taskIndex) =>
        capacityFixtureId(
          7,
          locationIndex * (CAPACITY_COHORT.tasksPerLocation + 1) + taskIndex,
        ),
    ),
    email,
    locationId,
    sentinelSessionId: capacityFixtureId(6, locationIndex),
  };
}

async function insertSession(
  transaction: PoolClient,
  locationIndex: number,
  taskIndex: number,
): Promise<void> {
  const itemIndex =
    locationIndex * (CAPACITY_COHORT.tasksPerLocation + 1) + taskIndex;
  const locationId = capacityFixtureId(1, locationIndex);
  const membershipId = capacityFixtureId(
    3,
    locationIndex * CAPACITY_COHORT.employeesPerLocation,
  );
  const vehicleId = capacityFixtureId(5, itemIndex);
  const sessionId =
    taskIndex === CAPACITY_COHORT.tasksPerLocation
      ? capacityFixtureId(6, locationIndex)
      : capacityFixtureId(7, itemIndex);
  await transaction.query(
    `INSERT INTO vehicles
       (id, organization_id, temporary_descriptor, make, model, color,
        created_at, updated_at)
     VALUES ($1, $2, $3, 'Synthetic', 'Capacity', 'Blue', now(), now())`,
    [vehicleId, organizationId, `Synthetic capacity vehicle ${itemIndex + 1}`],
  );
  await transaction.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        customer_access_revoked_at, organization_id, location_id, vehicle_id,
        state, checked_in_by_membership_id, checking_in_completed_at,
        check_in_condition_completed_at,
        check_in_condition_completed_by_membership_id,
        version, created_at, updated_at)
     VALUES ($1, $2, now() - interval '1 day', now() - interval '1 day',
             $3, $4, $5, 'AWAITING_PARKING', $6,
             now() - interval '30 minutes', now() - interval '30 minutes', $6,
             2,
             now() - interval '30 minutes', now() - interval '30 minutes')`,
    [
      sessionId,
      `mob025a-disabled-${itemIndex}`,
      organizationId,
      locationId,
      vehicleId,
      membershipId,
    ],
  );
  if (taskIndex < CAPACITY_COHORT.tasksPerLocation) {
    await transaction.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PARKING', 'QUEUED', 1,
               now() - interval '20 minutes' + ($5 * interval '1 second'),
               now() - interval '20 minutes' + ($5 * interval '1 second'))`,
      [
        capacityFixtureId(8, itemIndex),
        organizationId,
        locationId,
        sessionId,
        taskIndex,
      ],
    );
  }
}

export async function seedCapacityFixture(
  pool: Pool,
): Promise<CapacityFixture> {
  const existing = await pool.query(
    "SELECT 1 FROM organizations WHERE id = $1",
    [organizationId],
  );
  if ((existing.rowCount ?? 0) !== 0) {
    throw new Error(
      "Capacity fixture already exists; run the guarded local bootstrap before repeating the baseline.",
    );
  }
  const hash = await pool.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE email = 'valet@vaylet.demo.invalid'",
  );
  const passwordHash = hash.rows[0]?.password_hash;
  if (passwordHash === undefined) {
    throw new Error("Canonical local demo credential is unavailable.");
  }
  const transaction = await pool.connect();
  try {
    await transaction.query("BEGIN");
    await transaction.query(
      `INSERT INTO organizations
         (id, name, status, timezone, created_at, updated_at)
       VALUES ($1, 'MOB-025A Synthetic Capacity', 'ACTIVE', 'UTC', now(), now())`,
      [organizationId],
    );
    const clients: CapacityFixtureClient[] = [];
    for (
      let location = 0;
      location < CAPACITY_COHORT.locations;
      location += 1
    ) {
      await insertLocation(transaction, location);
      for (
        let employee = 0;
        employee < CAPACITY_COHORT.employeesPerLocation;
        employee += 1
      ) {
        clients.push(
          await insertEmployee(transaction, passwordHash, location, employee),
        );
      }
      for (let task = 0; task <= CAPACITY_COHORT.tasksPerLocation; task += 1) {
        await insertSession(transaction, location, task);
      }
    }
    await transaction.query("COMMIT");
    return { clients, organizationId };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    transaction.release();
  }
}

export async function inspectCapacityEffects(pool: Pool): Promise<{
  readonly dispatchEvents: number;
  readonly sentinelTasks: number;
}> {
  const result = await pool.query<{
    dispatch_events: number;
    sentinel_tasks: number;
  }>(
    `SELECT
       (SELECT count(*)::integer FROM dispatch_events d
        JOIN tasks t ON t.id = d.task_id
        WHERE t.organization_id = $1 AND t.valet_session_id IN
          (SELECT id FROM valet_sessions WHERE organization_id = $1
           AND id::text LIKE '025a0000-0000-4000-8000-06%')) AS dispatch_events,
       (SELECT count(*)::integer FROM tasks
        WHERE organization_id = $1 AND valet_session_id IN
          (SELECT id FROM valet_sessions WHERE organization_id = $1
           AND id::text LIKE '025a0000-0000-4000-8000-06%')) AS sentinel_tasks`,
    [organizationId],
  );
  return {
    dispatchEvents: result.rows[0]?.dispatch_events ?? -1,
    sentinelTasks: result.rows[0]?.sentinel_tasks ?? -1,
  };
}

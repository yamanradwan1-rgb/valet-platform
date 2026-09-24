import type { PoolClient } from "pg";

import { hashGuestAccessToken } from "../../src/modules/valet-sessions/guest-access-command";
import { MANAGEMENT_DASHBOARD_E2E as f } from "./management-dashboard-e2e-config";

const sessionIds = [f.operations.custody.sessionId, f.operations.guest.sessionId];

async function clearOwnedLifecycle(client: PoolClient): Promise<void> {
  await client.query(
    `DELETE FROM dispatch_events
     WHERE task_id IN (SELECT id FROM tasks WHERE valet_session_id = ANY($1::uuid[]))`,
    [sessionIds],
  );
  for (const table of [
    "tasks",
    "retrieval_requests",
    "key_custody_events",
    "audit_events",
  ]) {
    await client.query(`DELETE FROM ${table} WHERE valet_session_id = ANY($1::uuid[])`, [sessionIds]);
  }
}

async function seedVehicles(client: PoolClient): Promise<void> {
  for (const [id, descriptor] of [
    [f.operations.custody.vehicleId, "MD06 custody vehicle"],
    [f.operations.guest.vehicleId, "MD06 guest vehicle"],
  ] as const) {
    await client.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET temporary_descriptor = EXCLUDED.temporary_descriptor,
         updated_at = now()`,
      [id, f.organizations.a.id, descriptor],
    );
  }
}

export async function seedManagementDashboardE2eOperations(
  client: PoolClient,
): Promise<void> {
  await clearOwnedLifecycle(client);
  await client.query("DELETE FROM valet_sessions WHERE id = ANY($1::uuid[])", [sessionIds]);
  await seedVehicles(client);
  await client.query(
    `INSERT INTO key_slots (id, organization_id, location_id, code, status, updated_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', now())
     ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, status = 'ACTIVE', updated_at = now()`,
    [
      f.operations.custody.keySlotId,
      f.organizations.a.id,
      f.locations.a.id,
      f.operations.custody.keySlotCode,
    ],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, version, updated_at)
     VALUES ($1, $2, now() + interval '1 day', $3, $4, $5,
       'AWAITING_PARKING', $6, 1, now())`,
    [
      f.operations.custody.sessionId,
      `md06-custody-${f.operations.custody.sessionId}`,
      f.organizations.a.id,
      f.locations.a.id,
      f.operations.custody.vehicleId,
      f.users.employee.membershipId,
    ],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, customer_id, state,
        checked_in_by_membership_id, parked_at, version, updated_at)
     VALUES ($1, $2, now() + interval '1 day', $3, $4, $5, $6,
       'PARKED', $7, now() - interval '15 minutes', 1, now())`,
    [
      f.operations.guest.sessionId,
      hashGuestAccessToken(f.operations.guest.rawToken),
      f.organizations.a.id,
      f.locations.a.id,
      f.operations.guest.vehicleId,
      f.contact.customerId,
      f.users.employee.membershipId,
    ],
  );
}

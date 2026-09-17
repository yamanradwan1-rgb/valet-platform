import type { PoolClient } from "pg";

import { EMPLOYEE_E2E } from "./employee-e2e-config";

const spotIds = [
  "e2e00000-0000-4000-8000-000000000006",
  "e2e00000-0000-4000-8000-000000000008",
  "e2e00000-0000-4000-8000-000000000010",
  "e2e00000-0000-4000-8000-000000000012",
  "e2e00000-0000-4000-8000-000000000014",
  "e2e00000-0000-4000-8000-000000000016",
  "e2e00000-0000-4000-8000-000000000018",
  "e2e00000-0000-4000-8000-000000000020",
] as const;
const keyIds = [
  "e2e00000-0000-4000-8000-000000000007",
  "e2e00000-0000-4000-8000-000000000009",
  "e2e00000-0000-4000-8000-000000000011",
  "e2e00000-0000-4000-8000-000000000013",
  "e2e00000-0000-4000-8000-000000000015",
  "e2e00000-0000-4000-8000-000000000017",
  "e2e00000-0000-4000-8000-000000000019",
  "e2e00000-0000-4000-8000-000000000021",
] as const;

export async function persistEmployeeE2eFixture(
  client: PoolClient,
  passwordHash: string,
): Promise<void> {
  const f = EMPLOYEE_E2E;
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO organizations
         (id, name, status, timezone, release_requires_payment, updated_at)
       VALUES ($1, 'Employee E2E Organization', 'ACTIVE', 'UTC', false, now())
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE',
         release_requires_payment = false, updated_at = now()`,
      [f.organizationId],
    );
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, release_requires_payment_override, updated_at)
       VALUES ($1, $2, 'Employee E2E Location', $3, 'Loopback test site',
         'UTC', 'JOD', 'ACTIVE', TRUE, false, now())
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', accepting_intake = TRUE,
         release_requires_payment_override = false, updated_at = now()`,
      [f.locationId, f.organizationId, f.locationCode],
    );
    await client.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash, status = 'ACTIVE',
         updated_at = now()`,
      [f.userId, f.email, passwordHash],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, 'VALET_EMPLOYEE', 'ACTIVE', now())
       ON CONFLICT (id) DO UPDATE SET role = 'VALET_EMPLOYEE',
         status = 'ACTIVE', updated_at = now()`,
      [f.membershipId, f.organizationId, f.userId],
    );
    await client.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (membership_id, location_id) DO NOTHING`,
      [f.organizationId, f.membershipId, f.locationId],
    );
    await client.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', now() - interval '1 hour')
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', ended_at = NULL,
         started_at = now() - interval '1 hour'`,
      [f.shiftId, f.organizationId, f.locationId, f.membershipId],
    );
    await client.query(
      `INSERT INTO parking_zones
         (id, organization_id, location_id, code, label, status, updated_at)
       VALUES ($1, $2, $3, $4, 'Employee E2E Zone', 'ACTIVE', now())
       ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', updated_at = now()`,
      [f.parkingZoneId, f.organizationId, f.locationId, f.parkingZoneCode],
    );
    for (let index = 0; index < spotIds.length; index += 1) {
      await client.query(
        `INSERT INTO parking_spots
           (id, organization_id, location_id, parking_zone_id, code, label,
            status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5, 'ACTIVE', now())
         ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', updated_at = now()`,
        [spotIds[index], f.organizationId, f.locationId, f.parkingZoneId,
          f.parkingSpots[index]],
      );
      await client.query(
        `INSERT INTO key_slots
           (id, organization_id, location_id, code, status, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', now())
         ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', updated_at = now()`,
        [keyIds[index], f.organizationId, f.locationId, f.keySlots[index]],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

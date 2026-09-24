import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";

import { generateRecoveryCodes } from "../../src/modules/auth/mfa/mfa-recovery-code";
import { protectTotpSecret } from "../../src/modules/auth/mfa/mfa-secret-protection";
import { clearManagementDashboardE2eAntiAbuse } from "./management-dashboard-e2e-anti-abuse";
import { MANAGEMENT_DASHBOARD_E2E as f } from "./management-dashboard-e2e-config";
import { seedManagementDashboardE2eOperations } from "./management-dashboard-e2e-operations";

type FixtureUser = (typeof f.users)[keyof typeof f.users];

const uniqueUsers = Object.values(f.users).filter(
  (user, index, all) => all.findIndex((candidate) => candidate.userId === user.userId) === index,
);

export async function persistManagementDashboardE2eFixture(
  client: PoolClient,
  passwordHash: string,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await clearManagementDashboardE2eAntiAbuse(client);
    await clearRuntimeAuth(client);
    await clearOwnedManagementAudit(client);
    await upsertOrganizations(client);
    await upsertLocations(client);
    await upsertUsersAndMemberships(client, passwordHash);
    await resetLocationGrants(client);
    await resetShifts(client);
    await seedVisitContact(client);
    await seedManagementDashboardE2eOperations(client);
    await seedPreEnrolledMfa(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function clearOwnedManagementAudit(client: PoolClient): Promise<void> {
  await client.query(
    "DELETE FROM audit_events WHERE organization_id = ANY($1::uuid[])",
    [Object.values(f.organizations).map((organization) => organization.id)],
  );
}

async function clearRuntimeAuth(client: PoolClient): Promise<void> {
  const userIds = uniqueUsers.map((user) => user.userId);
  await client.query(
    `DELETE FROM staff_push_registrations
     WHERE staff_auth_session_id IN
       (SELECT id FROM staff_auth_sessions WHERE user_id = ANY($1::uuid[]))`,
    [userIds],
  );
  await client.query(
    `DELETE FROM staff_refresh_credentials
     WHERE session_id IN
       (SELECT id FROM staff_auth_sessions WHERE user_id = ANY($1::uuid[]))`,
    [userIds],
  );
  await client.query("DELETE FROM staff_auth_sessions WHERE user_id = ANY($1::uuid[])", [userIds]);
  await client.query(
    `DELETE FROM mfa_recovery_codes
     WHERE factor_id IN
       (SELECT id FROM user_mfa_totp_factors WHERE user_id = ANY($1::uuid[]))`,
    [userIds],
  );
  await client.query("DELETE FROM user_mfa_totp_factors WHERE user_id = ANY($1::uuid[])", [userIds]);
}

async function upsertOrganizations(client: PoolClient): Promise<void> {
  for (const organization of Object.values(f.organizations)) {
    await client.query(
      `INSERT INTO organizations
         (id, name, status, timezone, brand_primary_color, updated_at)
       VALUES ($1, $2, 'ACTIVE', 'Asia/Amman', '#176BFF', now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE',
         timezone = 'Asia/Amman', brand_primary_color = '#176BFF', updated_at = now()`,
      [organization.id, organization.name],
    );
    await client.query(
      `INSERT INTO organization_subscriptions
         (organization_id, plan_code, status, dashboard_access_enabled,
          report_exports_enabled, basic_branding_enabled)
       VALUES ($1, 'MD06_E2E', 'ACTIVE', TRUE, TRUE, TRUE)
       ON CONFLICT (organization_id) DO UPDATE SET plan_code = 'MD06_E2E',
         status = 'ACTIVE', dashboard_access_enabled = TRUE,
         report_exports_enabled = TRUE, basic_branding_enabled = TRUE,
         updated_at = now()`,
      [organization.id],
    );
  }
}

async function upsertLocations(client: PoolClient): Promise<void> {
  for (const location of Object.values(f.locations)) {
    await client.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, $3, $4, 'MD-06 loopback fixture', 'Asia/Amman', 'JOD',
         'ACTIVE', TRUE, now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code,
         status = 'ACTIVE', accepting_intake = TRUE, updated_at = now()`,
      [location.id, location.organizationId, location.name, location.code],
    );
  }
}

async function upsertUsersAndMemberships(
  client: PoolClient,
  passwordHash: string,
): Promise<void> {
  for (const user of uniqueUsers) {
    await client.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash, status = EXCLUDED.status, updated_at = now()`,
      [user.userId, user.email, passwordHash, user.email === f.users.disabled.email ? "DISABLED" : "ACTIVE"],
    );
  }
  for (const membership of Object.values(f.users)) {
    const organizationId = f.organizations[membership.organization].id;
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, version, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 1, now())
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE',
         version = 1, updated_at = now()`,
      [membership.membershipId, organizationId, membership.userId, membership.role],
    );
  }
}

async function resetLocationGrants(client: PoolClient): Promise<void> {
  const memberships = Object.values(f.users).map((user) => user.membershipId);
  await client.query(
    "DELETE FROM membership_location_access WHERE membership_id = ANY($1::uuid[])",
    [memberships],
  );
  const grants = [
    [f.users.locationManager, f.locations.a],
    [f.users.locationManager, f.locations.b],
    [f.users.supervisor, f.locations.a],
    [f.users.employee, f.locations.a],
    [f.users.foreignManager, f.locations.foreign],
  ] as const;
  for (const [user, location] of grants) {
    await client.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [location.organizationId, user.membershipId, location.id],
    );
  }
}

async function resetShifts(client: PoolClient): Promise<void> {
  const rows = [
    [f.shifts.supervisor, f.users.supervisor, f.locations.a],
    [f.shifts.employee, f.users.employee, f.locations.a],
  ] as const;
  await client.query("DELETE FROM shifts WHERE id = ANY($1::uuid[])", [
    rows.map(([id]) => id),
  ]);
  for (const [id, user, location] of rows) {
    await client.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', now() - interval '1 hour')`,
      [id, location.organizationId, location.id, user.membershipId],
    );
  }
}

async function seedVisitContact(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO customers
       (id, organization_id, phone_normalized, display_name, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET phone_normalized = EXCLUDED.phone_normalized,
       display_name = EXCLUDED.display_name, updated_at = now()`,
    [f.contact.customerId, f.organizations.a.id, f.contact.phone, f.contact.displayName],
  );
  await client.query(
    `INSERT INTO vehicles
       (id, organization_id, plate_country, plate_number_raw,
        plate_number_normalized, make, model, color, updated_at)
     VALUES ($1, $2, 'JO', 'MD06-606', 'MD06606', 'Test', 'Runtime', 'Black', now())
     ON CONFLICT (id) DO UPDATE SET plate_number_raw = EXCLUDED.plate_number_raw,
       plate_number_normalized = EXCLUDED.plate_number_normalized, updated_at = now()`,
    [f.contact.vehicleId, f.organizations.a.id],
  );
  await client.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, customer_id, state,
        checked_in_by_membership_id, created_at, completed_at, updated_at)
     VALUES ($1, $2, now() + interval '1 day', $3, $4, $5, $6, 'COMPLETED',
       $7, now() - interval '1 day', now() - interval '23 hours', now())
     ON CONFLICT (id) DO UPDATE SET customer_id = EXCLUDED.customer_id,
       vehicle_id = EXCLUDED.vehicle_id, state = 'COMPLETED',
       completed_at = EXCLUDED.completed_at, updated_at = now()`,
    [
      f.contact.sessionId,
      `md06-contact-${f.contact.sessionId}`,
      f.organizations.a.id,
      f.locations.a.id,
      f.contact.vehicleId,
      f.contact.customerId,
      f.users.supervisor.membershipId,
    ],
  );
}

async function seedPreEnrolledMfa(client: PoolClient): Promise<void> {
  const rows = [
    [f.users.conflictAdmin, f.preEnrolledFactors.conflictAdmin],
    [f.users.exportAdmin, f.preEnrolledFactors.exportAdmin],
    [f.users.multiAdminA, f.preEnrolledFactors.multiAdmin],
    [f.users.authorityAdmin, f.preEnrolledFactors.authorityAdmin],
  ] as const;
  for (const [user, factorId] of rows) {
    await insertFactor(client, user, factorId);
  }
}

async function insertFactor(
  client: PoolClient,
  user: FixtureUser,
  factorId: string,
): Promise<void> {
  const protectedSecret = protectTotpSecret(f.preEnrolledSecret, {
    factorId,
    userId: user.userId,
  });
  await client.query(
    `INSERT INTO user_mfa_totp_factors
       (id, user_id, state, protected_secret, last_accepted_step,
        recovery_set_generation, activated_at)
     VALUES ($1, $2, 'ACTIVE', $3, 0, 1, now())`,
    [factorId, user.userId, protectedSecret],
  );
  const codes = generateRecoveryCodes({ factorId, setGeneration: 1, userId: user.userId });
  for (let slot = 0; slot < codes.length; slot += 1) {
    const code = codes[slot]!;
    await client.query(
      `INSERT INTO mfa_recovery_codes
         (id, factor_id, set_generation, slot, selector, verifier)
       VALUES ($1, $2, 1, $3, $4, $5)`,
      [randomUUID(), factorId, slot + 1, code.selector, code.verifier],
    );
  }
}

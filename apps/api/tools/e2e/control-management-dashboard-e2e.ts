import { Pool, type PoolClient } from "pg";

import {
  assertManagementDashboardE2eTarget,
  MANAGEMENT_DASHBOARD_E2E as f,
} from "./management-dashboard-e2e-config";

type UserKey = keyof typeof f.users;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  assertManagementDashboardE2eTarget(databaseUrl);
  const [action, subject, value] = process.argv.slice(2);
  if (!action) throw new Error("Fixture control action is required.");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const result = await applyAction(client, action, subject, value);
      if (result !== undefined) process.stdout.write(`${result}\n`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function applyAction(
  client: PoolClient,
  action: string,
  subject?: string,
  value?: string,
): Promise<string | undefined> {
  if (action === "session-snapshot") {
    const sessionId = subject === "custody"
      ? f.operations.custody.sessionId
      : subject === "guest"
        ? f.operations.guest.sessionId
        : null;
    if (!sessionId) throw new Error("session-snapshot requires custody or guest.");
    const row = (
      await client.query<{ key_slot_id: string | null; state: string; version: number }>(
        `SELECT key_slot_id::text, state::text, version FROM valet_sessions WHERE id = $1`,
        [sessionId],
      )
    ).rows[0];
    if (!row) throw new Error("Management Dashboard E2E session snapshot is missing.");
    return JSON.stringify({
      keySlotId: row.key_slot_id,
      state: row.state,
      version: row.version,
    });
  }
  if (action === "membership") {
    const user = fixtureUser(subject);
    const status = value === "active" ? "ACTIVE" : value === "inactive" ? "INACTIVE" : null;
    if (!status) throw new Error("membership value must be active or inactive.");
    await client.query(
      `UPDATE organization_memberships
       SET status = $2, version = version + 1, updated_at = now()
       WHERE id = $1`,
      [user.membershipId, status],
    );
    return;
  }
  if (action === "role") {
    const user = fixtureUser(subject);
    const role = value === "admin"
      ? "ORG_ADMIN"
      : value === "employee"
        ? "VALET_EMPLOYEE"
        : null;
    if (!role) throw new Error("role value must be admin or employee.");
    await client.query(
      `UPDATE organization_memberships
       SET role = $2, version = version + 1, updated_at = now()
       WHERE id = $1`,
      [user.membershipId, role],
    );
    return;
  }
  if (action === "grant") {
    const user = fixtureUser(subject);
    const location = value === "on" || value === "off" ? f.locations.a : null;
    if (!location) throw new Error("grant value must be on or off.");
    if (value === "off") {
      await client.query(
        "DELETE FROM membership_location_access WHERE membership_id = $1 AND location_id = $2",
        [user.membershipId, location.id],
      );
    } else {
      await client.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (membership_id, location_id) DO NOTHING`,
        [location.organizationId, user.membershipId, location.id],
      );
    }
    return;
  }
  if (action === "dashboard-entitlement" || action === "export-entitlement") {
    if (subject !== "on" && subject !== "off") {
      throw new Error(`${action} value must be on or off.`);
    }
    const column = action === "dashboard-entitlement"
      ? "dashboard_access_enabled"
      : "report_exports_enabled";
    await client.query(
      `UPDATE organization_subscriptions SET ${column} = $2, updated_at = now()
       WHERE organization_id = $1`,
      [f.organizations.a.id, subject === "on"],
    );
    return;
  }
  if (action === "revoke-sessions") {
    const user = fixtureUser(subject);
    await client.query(
      `UPDATE staff_auth_sessions SET revoked_at = clock_timestamp()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.userId],
    );
    return;
  }
  if (action === "age-mfa") {
    const user = fixtureUser(subject);
    const minutes = Number(value ?? "10");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      throw new Error("age-mfa minutes must be an integer from 1 through 120.");
    }
    await client.query(
      `UPDATE staff_auth_sessions
       SET created_at = LEAST(
             created_at,
             clock_timestamp() - (($2 + 1)::text || ' minutes')::interval
           ),
           mfa_authenticated_at = clock_timestamp() - ($2::text || ' minutes')::interval,
           last_admin_activity_at = clock_timestamp() - ($2::text || ' minutes')::interval
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.userId, minutes],
    );
    return;
  }
  if (action === "branding-reset") {
    await client.query(
      `UPDATE organizations
       SET name = $2, brand_primary_color = '#176BFF', updated_at = now()
       WHERE id = $1`,
      [f.organizations.a.id, f.organizations.a.name],
    );
    await client.query(
      `UPDATE locations
       SET brand_display_name_override = NULL,
           brand_primary_color_override = NULL,
           updated_at = now()
       WHERE organization_id = $1`,
      [f.organizations.a.id],
    );
    return;
  }
  if (action === "branding-name") {
    if (!subject || subject.trim().length === 0) throw new Error("branding-name value is required.");
    await client.query(
      "UPDATE organizations SET name = $2, updated_at = now() WHERE id = $1",
      [f.organizations.a.id, subject],
    );
    return;
  }
  if (action === "branding-color") {
    if (!subject || !/^#[0-9A-F]{6}$/u.test(subject)) {
      throw new Error("branding-color requires canonical #RRGGBB.");
    }
    await client.query(
      "UPDATE organizations SET brand_primary_color = $2, updated_at = now() WHERE id = $1",
      [f.organizations.a.id, subject],
    );
    return;
  }
  if (action === "location-branding-name") {
    const location =
      subject === "a" ? f.locations.a
        : subject === "b" ? f.locations.b
          : null;
    if (!location || !value || value.trim().length === 0) {
      throw new Error("location-branding-name requires a or b and a value.");
    }
    await client.query(
      `UPDATE locations
       SET brand_display_name_override = $2, updated_at = now()
       WHERE id = $1`,
      [location.id, value],
    );
    return;
  }
  throw new Error(`Unknown Management Dashboard E2E action: ${action}`);
}

function fixtureUser(key: string | undefined) {
  if (!key || !(key in f.users)) throw new Error("A valid fixture user key is required.");
  return f.users[key as UserKey];
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`Management Dashboard E2E control failed: ${message}\n`);
  process.exitCode = 1;
});

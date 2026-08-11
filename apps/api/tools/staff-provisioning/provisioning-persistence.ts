import { randomUUID } from "node:crypto";

import {
  fail,
  StaffProvisioningError,
  type DatabaseClient,
  type ProvisioningArguments,
  type ProvisioningResult,
} from "./types";

export async function persistProvisionedStaff(
  client: DatabaseClient,
  input: ProvisioningArguments,
  normalizedEmail: string,
  passwordHash: string,
): Promise<ProvisioningResult> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  const auditEventId = randomUUID();
  await client.query("BEGIN");
  try {
    const organization = await client.query<{ status: string }>(
      "SELECT status::text AS status FROM organizations WHERE id = $1 FOR SHARE",
      [input.organizationId],
    );
    if (organization.rows[0]?.status !== "ACTIVE") {
      fail("Organization is unavailable for provisioning.");
    }
    const locations = await client.query<{
      id: string;
      organization_id: string;
      status: string;
    }>(
      `SELECT id::text, organization_id::text, status::text
       FROM locations WHERE id = ANY($1::uuid[]) FOR SHARE`,
      [input.locationIds],
    );
    if (
      locations.rowCount !== input.locationIds.length ||
      locations.rows.some(
        (location) =>
          location.organization_id !== input.organizationId ||
          location.status !== "ACTIVE",
      )
    ) {
      fail("One or more Locations are unavailable for provisioning.");
    }
    const existing = await client.query(
      "SELECT 1 FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if ((existing.rowCount ?? 0) !== 0) {
      fail("A User with this staff identity already exists.");
    }
    await client.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', transaction_timestamp())`,
      [userId, normalizedEmail, passwordHash],
    );
    await client.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [membershipId, input.organizationId, userId, input.role],
    );
    for (const locationId of input.locationIds) {
      await client.query(
        `INSERT INTO membership_location_access
           (organization_id, membership_id, location_id)
         VALUES ($1, $2, $3)`,
        [input.organizationId, membershipId, locationId],
      );
    }
    await client.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       VALUES ($1, $2, $3, NULL, NULL, 'STAFF_ACCOUNT_PROVISIONED',
               'OrganizationMembership', $4, $5::jsonb,
               transaction_timestamp())`,
      [
        auditEventId,
        input.organizationId,
        input.auditLocationId,
        membershipId,
        JSON.stringify({
          locationIds: input.locationIds,
          operatorRef: input.operatorRef,
          provisioningBoundary: "CONTROLLED_OPERATOR",
          reason: input.reason,
          role: input.role,
        }),
      ],
    );
    await client.query("COMMIT");
    return {
      auditEventId,
      locationIds: input.locationIds,
      membershipId,
      organizationId: input.organizationId,
      role: input.role,
      userId,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the bounded provisioning failure.
    }
    if (error instanceof StaffProvisioningError) throw error;
    fail("Staff provisioning failed.");
  }
}

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  input,
  passwordHash,
  persist,
  pool,
  scope,
} from "./provision-staff.integration-fixture";

describe("controlled staff provisioning persistence", () => {
  it("atomically creates normalized User, membership, exact access, and safe audit", async () => {
    const first = await scope();
    const secondLocationId = randomUUID();
    await pool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Second Location', $3, 'Test address', 'Asia/Amman',
               'JOD', 'ACTIVE', TRUE, transaction_timestamp())`,
      [secondLocationId, first.organizationId, secondLocationId],
    );
    const provisioning = input(
      first.organizationId,
      [secondLocationId, first.locationId],
      { auditLocationId: secondLocationId, role: "VALET_SUPERVISOR" },
    );
    const normalizedEmail = provisioning.email.trim().toLowerCase();
    const result = await persist(provisioning, normalizedEmail);

    const user = await pool.query<{
      email: string;
      password_hash: string;
      status: string;
    }>("SELECT email, password_hash, status::text FROM users WHERE id = $1", [
      result.userId,
    ]);
    expect(user.rows[0]).toEqual({
      email: normalizedEmail,
      password_hash: passwordHash,
      status: "ACTIVE",
    });
    const membership = await pool.query<{ role: string; status: string }>(
      `SELECT role::text, status::text FROM organization_memberships
       WHERE id = $1`,
      [result.membershipId],
    );
    expect(membership.rows[0]).toEqual({
      role: "VALET_SUPERVISOR",
      status: "ACTIVE",
    });
    const access = await pool.query<{ location_id: string }>(
      `SELECT location_id::text FROM membership_location_access
       WHERE membership_id = $1 ORDER BY location_id`,
      [result.membershipId],
    );
    expect(access.rows.map((row) => row.location_id)).toEqual(
      [...provisioning.locationIds].sort(),
    );
    const audit = await pool.query<{
      actor_membership_id: string | null;
      event_type: string;
      location_id: string;
      metadata_json: Record<string, unknown>;
      valet_session_id: string | null;
    }>(
      `SELECT actor_membership_id::text, event_type, location_id::text,
              metadata_json, valet_session_id::text
       FROM audit_events WHERE id = $1`,
      [result.auditEventId],
    );
    expect(audit.rows[0]).toEqual({
      actor_membership_id: null,
      event_type: "STAFF_ACCOUNT_PROVISIONED",
      location_id: secondLocationId,
      metadata_json: {
        locationIds: provisioning.locationIds,
        operatorRef: "CHANGE-004R",
        provisioningBoundary: "CONTROLLED_OPERATOR",
        reason: "Controlled initial staff provisioning",
        role: "VALET_SUPERVISOR",
      },
      valet_session_id: null,
    });
    const serialized = JSON.stringify(audit.rows[0]?.metadata_json);
    expect(serialized).not.toContain(normalizedEmail);
    expect(serialized).not.toContain(passwordHash);
    expect(Object.keys(result).sort()).toEqual([
      "auditEventId",
      "locationIds",
      "membershipId",
      "organizationId",
      "role",
      "userId",
    ]);
  });
});

import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import {
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";
import {
  closeLockLeases,
  makeLockPool,
  openLockLease,
  sessionShared,
  sessionUnlock,
  trace,
  waitForCanonicalWriter,
} from "./issue333-u002-lock-lab";

let pool: Pool;

beforeAll(async () => {
  await startIssue333Lab();
  pool = makeLockPool();
}, 180_000);

afterAll(async () => {
  try {
    if (pool) await pool.end();
  } finally {
    await stopIssue333Lab();
  }
}, 90_000);

it("blocks authentic MFA Company Admin HTTP revoke behind synthetic LM session SHARED", async () => {
  const managerUser = await fixture.createUser();
  const { organizationId, membershipId } = await fixture.createMembership(
    managerUser.id,
    { role: "LOCATION_MANAGER" },
  );
  const locationA = (await fixture.addLocation(organizationId)).locationId;
  const locationB = (await fixture.addLocation(organizationId)).locationId;
  for (const locationId of [locationA, locationB]) {
    await fixture.query(
      `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES ($1,$2,$3)`,
      [organizationId, membershipId, locationId],
    );
  }
  const adminUser = await fixture.createUser();
  await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  const before = await fixture.query<{ version: number }>(
    "SELECT version FROM organization_memberships WHERE id=$1",
    [membershipId],
  );
  const reader = await openLockLease(pool);
  let writer: ReturnType<typeof fixture.managementPost> | undefined;
  try {
    await sessionShared(reader, organizationId);
    writer = fixture.managementPost(
      `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}/location-access/revoke`,
      admin.accessToken,
      { expectedVersion: before.rows[0]!.version, locationIds: [locationA] },
    );
    const blocked = await waitForCanonicalWriter(reader.pid);
    trace("CANONICAL_REVOKER_BLOCKED", {
      readerPid: reader.pid,
      writerPid: blocked.pid,
      blockers: blocked.blockers,
    });
    expect(blocked.blockers).toContain(reader.pid);
    const uncommitted = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [organizationId, membershipId, locationA],
    );
    expect(uncommitted.rows[0]!.count).toBe("1");
    await sessionUnlock(reader, organizationId);
    const result = await writer;
    expect(result.status).toBe(201);
    const after = await fixture.query<{ count: string; version: number }>(
      `SELECT count(access.location_id)::text AS count, membership.version
       FROM organization_memberships AS membership
       LEFT JOIN membership_location_access AS access
         ON access.membership_id=membership.id AND access.location_id=$2
       WHERE membership.id=$1 GROUP BY membership.version`,
      [membershipId, locationA],
    );
    expect(after.rows[0]!.count).toBe("0");
    expect(after.rows[0]!.version).toBeGreaterThan(before.rows[0]!.version);
    const events = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND event_type='STAFF_LOCATION_ACCESS_REVOKED'
         AND entity_id=$2`,
      [organizationId, membershipId],
    );
    expect(events.rows[0]!.count).toBe("1");
    trace("CANONICAL_REVOKER_COMMITTED", {
      writerStatus: result.status,
      grantCount: after.rows[0]!.count,
      versionAdvanced: true,
      auditCount: events.rows[0]!.count,
    });
  } finally {
    await closeLockLeases(reader);
    if (writer) await Promise.allSettled([writer]);
  }
}, 45_000);

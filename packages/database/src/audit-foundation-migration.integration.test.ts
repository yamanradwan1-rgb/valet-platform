import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyAuditMigration,
  applyAuditMigrations,
  createAuditFoundationFixture,
  createAuditTestDatabase,
  dropAuditTestDatabases,
  type AuditFoundationFixture,
} from "./audit-foundation-test-context.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

const suffix = randomUUID().replaceAll("-", "");
const freshName = `valet_audit_fresh_${suffix}`;
const upgradeName = `valet_audit_upgrade_${suffix}`;
const auditMigration = "20260915003500_mgt_be_01_audit_foundation";
const clients: Client[] = [];

async function expectPgError(
  operation: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code, constraint });
}

async function insertTenantAudit(
  client: Client,
  fixture: AuditFoundationFixture,
  locationId: string | null,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, actor_membership_id, actor_type,
        event_type, entity_type, entity_id, metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, 'MEMBERSHIP', 'MANAGEMENT_TEST_EVENT',
             'Organization', $2, '{"changed":true}', transaction_timestamp())`,
    [id, fixture.organizationId, locationId, fixture.membershipId],
  );
  return id;
}

let fresh: Client;
let upgrade: Client;
let historicalAuditId: string;
let upgradeFixture: AuditFoundationFixture;

beforeAll(async () => {
  fresh = await createAuditTestDatabase(freshName, clients);
  await applyAuditMigrations(fresh, expectedMigrationDirectories);
  upgrade = await createAuditTestDatabase(upgradeName, clients);
  await applyAuditMigrations(
    upgrade,
    expectedMigrationDirectories.slice(0, -1),
  );
  upgradeFixture = await createAuditFoundationFixture(upgrade);
  historicalAuditId = randomUUID();
  await upgrade.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, actor_membership_id, event_type,
        entity_type, entity_id, metadata_json, occurred_at)
     VALUES ($1, $2, $3, NULL, 'LEGACY_EVENT', 'Organization', $2,
             '{"legacy":true}', '2026-01-01T00:00:00Z')`,
    [
      historicalAuditId,
      upgradeFixture.organizationId,
      upgradeFixture.locationId,
    ],
  );
  await applyAuditMigration(upgrade, auditMigration);
}, 120_000);

afterAll(async () => {
  for (const client of clients) await client.end();
  await dropAuditTestDatabases([freshName, upgradeName]);
}, 60_000);

describe("MGT-BE-01 audit foundation migration 35", () => {
  it("applies through the fresh path and preserves an upgraded historical row", async () => {
    expect(expectedMigrationDirectories).toHaveLength(35);
    expect(expectedMigrationDirectories.at(-1)).toBe(auditMigration);
    const legacy = await upgrade.query(
      `SELECT organization_id::text, location_id::text, actor_type::text,
              actor_operator_ref, metadata_json, occurred_at::text
       FROM audit_events WHERE id = $1`,
      [historicalAuditId],
    );
    expect(legacy.rows[0]).toMatchObject({
      actor_type: null,
      actor_operator_ref: null,
      location_id: upgradeFixture.locationId,
      metadata_json: { legacy: true },
      organization_id: upgradeFixture.organizationId,
    });
  });

  it("accepts Organization-only audit and retains Location tenant integrity", async () => {
    const first = await createAuditFoundationFixture(fresh);
    const second = await createAuditFoundationFixture(fresh);
    await expect(insertTenantAudit(fresh, first, null)).resolves.toBeTypeOf(
      "string",
    );
    await expectPgError(
      insertTenantAudit(fresh, first, second.locationId),
      "23503",
      "audit_events_org_location_id_fkey",
    );
    await expectPgError(
      fresh.query(
        `INSERT INTO audit_events
           (id, organization_id, actor_type, event_type, entity_type, entity_id,
            metadata_json, occurred_at)
         VALUES ($1, $2, 'SYSTEM', 'TEST', 'Organization', $2, '{}', now())`,
        [randomUUID(), randomUUID()],
      ),
      "23503",
      "audit_events_organization_id_fkey",
    );
  });

  it("keeps Location mandatory for session-scoped audit", async () => {
    const fixture = await createAuditFoundationFixture(fresh);
    await expectPgError(
      fresh.query(
        `INSERT INTO audit_events
           (id, organization_id, location_id, valet_session_id, actor_type,
            event_type, entity_type, entity_id, metadata_json, occurred_at)
         VALUES ($1, $2, NULL, $3, 'SYSTEM', 'TEST', 'ValetSession', $3, '{}', now())`,
        [randomUUID(), fixture.organizationId, randomUUID()],
      ),
      "23514",
      "audit_events_session_requires_location_check",
    );
  });

  it("requires explicit truthful non-membership provenance on new tenant rows", async () => {
    const fixture = await createAuditFoundationFixture(fresh);
    await expectPgError(
      fresh.query(
        `INSERT INTO audit_events
           (id, organization_id, event_type, entity_type, entity_id,
            metadata_json, occurred_at)
         VALUES ($1, $2, 'TEST', 'Organization', $2, '{}', now())`,
        [randomUUID(), fixture.organizationId],
      ),
      "23502",
    );
  });

  it("stores one account event without tenant fabrication or tenant projection", async () => {
    const userId = randomUUID();
    const first = await createAuditFoundationFixture(fresh, userId);
    await createAuditFoundationFixture(fresh, userId);
    const eventId = randomUUID();
    await fresh.query(
      `INSERT INTO account_security_audit_events
         (id, subject_user_id, actor_type, actor_user_id, event_type, occurred_at)
       VALUES ($1, $2, 'USER', $2, 'ACCOUNT_SECURITY_TESTED', now())`,
      [eventId, userId],
    );
    const counts = await fresh.query(
      `SELECT
         (SELECT count(*)::int FROM account_security_audit_events WHERE id=$1) AS account,
         (SELECT count(*)::int FROM audit_events WHERE organization_id=$2) AS tenant`,
      [eventId, first.organizationId],
    );
    expect(counts.rows[0]).toEqual({ account: 1, tenant: 0 });
  });

  it("enforces account User integrity and has no arbitrary metadata column", async () => {
    await expectPgError(
      fresh.query(
        `INSERT INTO account_security_audit_events
           (id, actor_type, event_type, occurred_at)
         VALUES ($1, 'USER', 'ACCOUNT_SECURITY_TESTED', now())`,
        [randomUUID()],
      ),
      "23514",
      "account_security_audit_events_actor_provenance_check",
    );
    await expectPgError(
      fresh.query(
        `INSERT INTO account_security_audit_events
           (id, subject_user_id, actor_type, event_type, occurred_at)
         VALUES ($1, $2, 'SYSTEM', 'ACCOUNT_SECURITY_TESTED', now())`,
        [randomUUID(), randomUUID()],
      ),
      "23503",
      "account_security_audit_events_subject_user_id_fkey",
    );
    const columns = await fresh.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name='account_security_audit_events'`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining([
        "location_id",
        "metadata_json",
        "organization_id",
      ]),
    );
  });

  it("rolls a protected mutation back when tenant audit fails", async () => {
    const fixture = await createAuditFoundationFixture(fresh);
    const before = await fresh.query<{ name: string }>(
      "SELECT name FROM organizations WHERE id=$1",
      [fixture.organizationId],
    );
    await fresh.query("BEGIN");
    try {
      await fresh.query(
        "UPDATE organizations SET name='must roll back' WHERE id=$1",
        [fixture.organizationId],
      );
      await fresh.query(
        `INSERT INTO audit_events
           (id, organization_id, event_type, entity_type, entity_id,
            metadata_json, occurred_at)
         VALUES ($1, $2, 'TEST', 'Organization', $2, '{}', now())`,
        [randomUUID(), fixture.organizationId],
      );
    } catch {
      await fresh.query("ROLLBACK");
    }
    const after = await fresh.query<{ name: string }>(
      "SELECT name FROM organizations WHERE id=$1",
      [fixture.organizationId],
    );
    expect(after.rows[0]?.name).toBe(before.rows[0]?.name);
  });
});

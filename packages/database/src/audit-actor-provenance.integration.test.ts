import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applyAuditMigrations,
  createAuditFoundationFixture,
  createAuditTestDatabase,
  dropAuditTestDatabases,
  type AuditFoundationFixture,
} from "./audit-foundation-test-context.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

const databaseName = `valet_audit_actor_${randomUUID().replaceAll("-", "")}`;
const clients: Client[] = [];
let client: Client;
let fixture: AuditFoundationFixture;

async function expectConstraint(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code: "23514", constraint });
}

function tenantInsert(
  actorType: string,
  membershipId: string | null,
  operatorRef: string | null,
) {
  return client.query(
    `INSERT INTO audit_events
       (id, organization_id, actor_membership_id, actor_type,
        actor_operator_ref, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'ACTOR_TESTED', 'Organization', $2,
             '{}', now())`,
    [
      randomUUID(),
      fixture.organizationId,
      membershipId,
      actorType,
      operatorRef,
    ],
  );
}

function accountInsert(
  actorType: string,
  actorUserId: string | null,
  operatorRef: string | null,
) {
  return client.query(
    `INSERT INTO account_security_audit_events
       (id, subject_user_id, actor_type, actor_user_id, actor_operator_ref,
        event_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, 'ACTOR_TESTED', now())`,
    [randomUUID(), fixture.userId, actorType, actorUserId, operatorRef],
  );
}

beforeAll(async () => {
  client = await createAuditTestDatabase(databaseName, clients);
  await applyAuditMigrations(client, expectedMigrationDirectories);
  fixture = await createAuditFoundationFixture(client);
}, 120_000);

afterAll(async () => {
  for (const connection of clients) await connection.end();
  await dropAuditTestDatabases([databaseName]);
}, 60_000);

describe("MGT-BE-01 normalized actor provenance", () => {
  it("requires exactly the tenant actor identity for each actor type", async () => {
    await expect(
      tenantInsert("CONTROLLED_OPERATOR", null, "CHANGE-004R"),
    ).resolves.toMatchObject({ rowCount: 1 });
    for (const invalid of [
      ["CONTROLLED_OPERATOR", null, null],
      ["SYSTEM", null, "CHANGE-004R"],
      ["MEMBERSHIP", fixture.membershipId, "CHANGE-004R"],
    ] as const) {
      const [actorType, membershipId, operatorRef] = invalid;
      await expectConstraint(
        tenantInsert(actorType, membershipId, operatorRef),
        "audit_events_actor_provenance_check",
      );
    }
  });

  it("requires exactly the account-security actor identity", async () => {
    await expect(
      accountInsert("CONTROLLED_OPERATOR", null, "RECOVERY-004R"),
    ).resolves.toMatchObject({ rowCount: 1 });
    for (const invalid of [
      ["CONTROLLED_OPERATOR", null, null],
      ["SYSTEM", null, "RECOVERY-004R"],
      ["USER", fixture.userId, "RECOVERY-004R"],
    ] as const) {
      const [actorType, actorUserId, operatorRef] = invalid;
      await expectConstraint(
        accountInsert(actorType, actorUserId, operatorRef),
        "account_security_audit_events_actor_provenance_check",
      );
    }
  });

  it("rejects contact-like or whitespace-bearing operator references", async () => {
    for (const operatorRef of ["operator@example.com", "operator ref"]) {
      await expectConstraint(
        tenantInsert("CONTROLLED_OPERATOR", null, operatorRef),
        "audit_events_actor_operator_ref_check",
      );
      await expectConstraint(
        accountInsert("CONTROLLED_OPERATOR", null, operatorRef),
        "account_security_audit_events_actor_operator_ref_check",
      );
    }
  });
});

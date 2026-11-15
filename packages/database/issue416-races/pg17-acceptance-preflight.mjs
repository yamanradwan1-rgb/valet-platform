import {
  ACL_SQL,
  DEFAULT_FUNCTION_ACL_SQL,
  FUNCTION_ACL_SQL,
  IDENTITY_SQL,
  MIGRATION_SQL,
  OWNER_MEMBERSHIP_SQL,
  OWNER_ROLE_SQL,
  RELATION_INVENTORY_SQL,
  SCHEMA_ACL_SQL,
  assertCommittedExactLedger,
  assertPrivateAcl,
} from "./pg17-acceptance-catalog.mjs";
import { assertAcceptanceIdentity } from "./pg17-acceptance-target.mjs";
import {
  ELEVATED_MEMBERSHIP_SQL,
  LOGIN_PRIVILEGES_SQL,
  assertLoginPrivilegeIsolation,
} from "./pg17-acceptance-role-guards.mjs";
import {
  PRIVATE_TRIGGER_SQL,
  assertPrivateTriggers,
} from "./pg17-acceptance-trigger-manifest.mjs";
import {
  PRIVATE_INDEX_SQL,
  PRIVATE_CONSTRAINT_SQL,
  assertPinnedObjectCatalog,
} from "./pg17-acceptance-object-manifest.mjs";
import {
  PUBLIC_AUDIT_TRIGGER_SQL,
  assertPublicAuditTriggers,
} from "./pg17-acceptance-public-audit.mjs";
import {
  FUNCTION_BODY_SQL,
  assertPinnedFunctionBodies,
} from "./pg17-acceptance-function-source.mjs";
import {
  INTERNAL_RI_TRIGGER_SQL,
  assertInternalRiTriggers,
} from "./pg17-acceptance-internal-triggers.mjs";

export async function readOnlyPreflight(client, target) {
  await client.query("BEGIN READ ONLY ISOLATION LEVEL READ COMMITTED");
  try {
    const identity = (await client.query(IDENTITY_SQL)).rows;
    if (identity.length !== 1) {
      throw new Error("W30_PG17_IDENTITY_ROW_COUNT");
    }
    const attested = assertAcceptanceIdentity(identity[0], target);
    const ledger = (await client.query(MIGRATION_SQL)).rows;
    const migrations = assertCommittedExactLedger(ledger);
    const acl = (await client.query(ACL_SQL, [target.runtime, target.migrator]))
      .rows;
    const funcs = (await client.query(FUNCTION_ACL_SQL, [target.runtime])).rows;
    const functionBodies = (await client.query(FUNCTION_BODY_SQL)).rows;
    assertPinnedFunctionBodies(functionBodies);
    const schemas = (
      await client.query(SCHEMA_ACL_SQL, [target.runtime, target.migrator])
    ).rows;
    const defaults = (await client.query(DEFAULT_FUNCTION_ACL_SQL)).rows;
    const ownerRole = (await client.query(OWNER_ROLE_SQL)).rows;
    const ownerMembership = (
      await client.query(OWNER_MEMBERSHIP_SQL, [target.migrator])
    ).rows;
    const relationRows = (await client.query(RELATION_INVENTORY_SQL)).rows;
    assertPrivateAcl(
      acl,
      funcs,
      schemas,
      defaults,
      ownerRole,
      ownerMembership,
      target.migrator,
      relationRows,
    );
    const triggers = (await client.query(PRIVATE_TRIGGER_SQL)).rows;
    assertPrivateTriggers(triggers);
    const indexes = (await client.query(PRIVATE_INDEX_SQL)).rows;
    const constraints = (await client.query(PRIVATE_CONSTRAINT_SQL)).rows;
    assertPinnedObjectCatalog(indexes, constraints, triggers);
    const publicAudit = (await client.query(PUBLIC_AUDIT_TRIGGER_SQL)).rows;
    assertPublicAuditTriggers(publicAudit);
    const internalRi = (await client.query(INTERNAL_RI_TRIGGER_SQL)).rows;
    assertInternalRiTriggers(internalRi);
    const logins = (await client.query(LOGIN_PRIVILEGES_SQL)).rows;
    const elevated = (await client.query(ELEVATED_MEMBERSHIP_SQL)).rows;
    assertLoginPrivilegeIsolation(logins, elevated, target);
    return Object.freeze({ ...attested, migrations, aclTables: acl.length });
  } finally {
    await client.query("ROLLBACK");
  }
}

import { createRequire } from "node:module";

import { preflightSanitizedChild } from "./target-preflight.mjs";
import { assertTargetEnvironment, TARGET } from "./target-contract.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Client } = require("pg");

const HISTORY_SQL = `
SELECT id::text, migration_name, checksum, started_at::text, finished_at::text,
       rolled_back_at::text, applied_steps_count, logs
FROM public._prisma_migrations ORDER BY started_at, migration_name, id`;
const CATALOG_SQL = `
SELECT (SELECT count(*)::integer FROM pg_catalog.pg_namespace
        WHERE nspname IN ('auth_proof_private', 'auth_proof_crypto')) AS schema_count,
       (SELECT count(*)::integer FROM pg_catalog.pg_roles
        WHERE rolname = 'vap1_proof_owner') AS proof_role_count,
       (SELECT count(*)::integer FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname IN ('auth_proof_private', 'auth_proof_crypto')) AS relation_count`;
const ROLES_SQL = `
SELECT oid::text, rolname, rolcanlogin, rolsuper, rolcreatedb,
       rolcreaterole, rolinherit, rolreplication, rolbypassrls
FROM pg_catalog.pg_roles ORDER BY rolname`;
const MEMBERSHIPS_SQL = `
SELECT roleid::text, member::text, grantor::text,
       admin_option, inherit_option, set_option
FROM pg_catalog.pg_auth_members
ORDER BY roleid, member, grantor`;
const DEFAULT_ACLS_SQL = `
SELECT defaclrole::text AS owner_oid, defaclnamespace::text AS namespace_oid,
       defaclobjtype AS object_type, defaclacl::text AS acl
FROM pg_catalog.pg_default_acl
ORDER BY defaclrole, defaclnamespace, defaclobjtype`;

export async function snapshotW9RecoveryState(env = process.env) {
  const urls = assertTargetEnvironment(env);
  const before = await preflightSanitizedChild(env);
  const client = new Client({
    connectionString: urls.MIGRATION_DATABASE_URL,
    connectionTimeoutMillis: 3000,
    query_timeout: 5000,
    statement_timeout: 5000,
    ssl: false,
  });
  let begun = false;
  try {
    await client.connect();
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    begun = true;
    const identity = await client.query(`
      SELECT current_setting('transaction_read_only') AS read_only,
             current_database() AS database, current_user AS actor`);
    if (identity.rows.length !== 1 || identity.rows[0].read_only !== "on" ||
        identity.rows[0].database !== TARGET.database ||
        identity.rows[0].actor !== TARGET.trustedMigrationRole) {
      throw new Error("Issue416 recovery diagnostic lost W9 read-only identity.");
    }
    const history = await client.query(HISTORY_SQL);
    const catalog = await client.query(CATALOG_SQL);
    const roles = await client.query(ROLES_SQL);
    const memberships = await client.query(MEMBERSHIPS_SQL);
    const defaultAcls = await client.query(DEFAULT_ACLS_SQL);
    await client.query("ROLLBACK");
    begun = false;
    const after = await preflightSanitizedChild(env);
    if (before.containerId !== after.containerId ||
        before.serverStarted !== after.serverStarted ||
        before.imageId !== after.imageId) {
      throw new Error("Issue416 recovery target changed during read-only preflight.");
    }
    return {
      rows: history.rows,
      catalog: catalog.rows[0],
      roles: roles.rows,
      memberships: memberships.rows,
      defaultAcls: defaultAcls.rows,
      target: after,
    };
  } finally {
    if (begun) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

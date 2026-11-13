import { createRequire } from "node:module";

import { preflightSanitizedChild } from "./target-preflight.mjs";
import { assertTargetEnvironment, TARGET } from "./target-contract.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Client } = require("pg");

// Queries contain only SELECTs and constant schema names; no DDL, cleanup,
// migrate resolve, or changes to failed migration bookkeeping are permitted.
export const DIAGNOSTIC_QUERIES = Object.freeze({
  migrations: `
    SELECT migration_name, started_at::text, finished_at::text,
           rolled_back_at::text, applied_steps_count,
           left(coalesce(logs, ''), 6000) AS logs
    FROM public._prisma_migrations
    WHERE migration_name LIKE '20261113011%issue416%'
    ORDER BY started_at, migration_name`,
  namespaces: `
    SELECT n.nspname AS schema, owner.rolname AS owner,
           n.nspacl::text AS acl,
           has_schema_privilege($1::name, n.oid, 'USAGE') AS migrator_usage,
           has_schema_privilege($1::name, n.oid, 'CREATE') AS migrator_create,
           has_schema_privilege(to_regrole($2), n.oid, 'USAGE') AS proof_owner_usage,
           has_schema_privilege(to_regrole($2), n.oid, 'CREATE') AS proof_owner_create,
           has_schema_privilege($3::name, n.oid, 'USAGE') AS runtime_usage
    FROM pg_catalog.pg_namespace n
    JOIN pg_catalog.pg_roles owner ON owner.oid = n.nspowner
    WHERE n.nspname IN ('auth_proof_private', 'auth_proof_crypto', 'public')
    ORDER BY n.nspname`,
  relations: `
    SELECT n.nspname AS schema, c.relname AS relation,
           c.relkind AS kind, r.rolname AS owner,
           c.relacl::text AS acl
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
    WHERE n.nspname IN ('auth_proof_private', 'auth_proof_crypto')
       OR (n.nspname = 'public' AND c.relname = '_prisma_migrations')
    ORDER BY n.nspname, c.relname`,
  roles: `
    SELECT r.rolname AS role, r.rolcanlogin AS login, r.rolsuper AS superuser,
           r.rolcreaterole AS create_role,
           r.rolinherit AS inherits,
           r.rolbypassrls AS bypass_rls
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ($1::name, $2::name, $3::name)
    ORDER BY r.rolname`,
  memberships: `
    SELECT target.rolname AS granted_role, member.rolname AS member,
           m.inherit_option, m.set_option, m.admin_option
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles target ON target.oid = m.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = m.member
    WHERE target.rolname = $1::name OR member.rolname = $1::name
    ORDER BY target.rolname, member.rolname`,
});

export function sanitizeDiagnosticLogs(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[REDACTED]")
    .replace(/(PASSWORD|PGPASSWORD|secret|root_key)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]")
    .slice(0, 6000);
}

function describeRows(result) {
  return result.rows.map((row) => ({ ...row }));
}

export async function inspectFailedMigration(env = process.env) {
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
    const fence = await client.query(`
      SELECT current_setting('transaction_read_only') AS read_only,
             current_database() AS database, current_user AS actor`);
    if (fence.rows?.length !== 1 || fence.rows[0].read_only !== "on" ||
        fence.rows[0].database !== TARGET.database ||
        fence.rows[0].actor !== TARGET.trustedMigrationRole) {
      throw new Error("Issue416 diagnostic lost read-only or migration identity.");
    }
    const params = [TARGET.trustedMigrationRole, "vap1_proof_owner",
      TARGET.roles.DATABASE_URL[0]];
    const result = {};
    for (const [name, sql] of Object.entries(DIAGNOSTIC_QUERIES)) {
      const values = name === "migrations" || name === "relations" ? [] :
        name === "memberships" ? ["vap1_proof_owner"] :
        name === "roles" ? params : params;
      const rows = describeRows(await client.query(sql, values));
      if (name === "migrations") {
        for (const row of rows) row.logs = sanitizeDiagnosticLogs(row.logs);
      }
      result[name] = rows;
    }
    await client.query("ROLLBACK");
    begun = false;
    const after = await preflightSanitizedChild(env);
    if (before.containerId !== after.containerId ||
        before.serverStarted !== after.serverStarted ||
        before.imageId !== after.imageId) {
      throw new Error("Issue416 diagnostic target changed during read-only inspection.");
    }
    return result;
  } finally {
    if (begun) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

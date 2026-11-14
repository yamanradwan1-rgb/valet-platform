import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const IDENTITY_SQL = `
SELECT current_database() AS database, current_user AS actor,
 session_user AS session_role, pg_backend_pid() AS backend_pid,
 pg_get_userbyid(d.datdba) AS database_owner,
 shobj_description(d.oid, 'pg_database') AS marker,
 inet_server_port() AS server_port,
 current_setting('server_version_num')::integer AS server_version,
 current_setting('transaction_isolation') AS transaction_isolation,
 current_setting('transaction_read_only') AS transaction_read_only,
 pg_postmaster_start_time()::text AS server_started,
 pg_is_in_recovery() AS recovery,
 r.rolsuper AS is_superuser, r.rolcreatedb AS can_create_db,
 r.rolcreaterole AS can_create_role, r.rolbypassrls AS bypass_rls,
 r.rolreplication AS can_replicate,
 pg_has_role(current_user, d.datdba, 'MEMBER') AS owner_member,
 has_database_privilege(current_user, d.oid, 'CREATE') AS can_create_schema
FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
WHERE d.datname = current_database()`;

export const MIGRATION_SQL = `
SELECT migration_name, checksum, finished_at, rolled_back_at,
       started_at, applied_steps_count
FROM public._prisma_migrations ORDER BY migration_name, id`;

export const ACL_SQL = `
SELECT n.nspname AS schema_name, c.relname AS table_name,
 has_table_privilege($1::name, c.oid, 'INSERT') AS insert_allowed,
 has_table_privilege($1::name, c.oid, 'UPDATE') AS update_allowed,
 has_table_privilege($1::name, c.oid, 'DELETE') AS delete_allowed,
 has_table_privilege($1::name, c.oid, 'TRUNCATE') AS truncate_allowed,
 has_any_column_privilege($1::name, c.oid, 'INSERT') AS column_insert_allowed,
 has_any_column_privilege($1::name, c.oid, 'UPDATE') AS column_update_allowed,
 pg_has_role($1::name, c.relowner, 'MEMBER') AS owner_membership,
 EXISTS (SELECT 1 FROM pg_attribute a
         CROSS JOIN LATERAL aclexplode(a.attacl) acl
         WHERE a.attrelid = c.oid AND a.attnum > 0
           AND NOT a.attisdropped AND acl.grantee = 0
           AND acl.privilege_type IN ('INSERT','UPDATE'))
         AS public_column_write_allowed,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
         WHERE a.grantee = 0 AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))
         AS public_write_allowed
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth_proof_private' AND c.relkind IN ('r','p')`;

export const FUNCTION_ACL_SQL = `
SELECT p.oid::regprocedure::text AS signature,
 has_function_privilege($1::name, p.oid, 'EXECUTE') AS runtime_execute,
 EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'auth_proof_private'`;

const migrationsPath = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function migrationSourceChecksums() {
  const folders = readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const result = new Map();
  for (const name of folders) {
    if (!/^\d{14}_[a-z0-9_-]+$/.test(name)) {
      throw new Error("W30_PG17_UNEXPECTED_MIGRATION_DIRECTORY");
    }
    const bytes = readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url));
    const normalized = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    result.set(name, new Set([hash(bytes), hash(normalized)]));
  }
  if (result.size < 19 || [...result.keys()].filter((name) => name.includes("issue416")).length < 19) {
    throw new Error("W30_PG17_ISSUE416_MIGRATION_SOURCE_INCOMPLETE");
  }
  return result;
}

export function assertCommittedExactLedger(rows, source = migrationSourceChecksums()) {
  if (!Array.isArray(rows) || rows.length !== source.size) {
    throw new Error("W30_PG17_MIGRATION_HISTORY_INCOMPLETE");
  }
  const seen = new Set();
  for (const row of rows) {
    if (!row || !source.has(row.migration_name) || seen.has(row.migration_name) ||
      !source.get(row.migration_name).has(row.checksum) ||
      row.finished_at == null || row.rolled_back_at != null ||
      row.started_at == null || !Number.isSafeInteger(row.applied_steps_count) ||
      row.applied_steps_count < 1) {
      throw new Error("W30_PG17_MIGRATION_HISTORY_UNTRUSTED");
    }
    seen.add(row.migration_name);
  }
  return seen.size;
}

export function assertPrivateAcl(rows, functions) {
  if (!Array.isArray(rows) || rows.length < 1 ||
    !rows.some((row) => row.schema_name === "auth_proof_private" &&
      row.table_name === "authority_admissions") ||
    rows.some((row) => !row || row.schema_name !== "auth_proof_private" ||
      ["insert_allowed", "update_allowed", "delete_allowed", "truncate_allowed",
        "column_insert_allowed", "column_update_allowed", "owner_membership",
        "public_column_write_allowed", "public_write_allowed"]
        .some((field) => row[field] !== false)) ||
    !Array.isArray(functions) || functions.length < 1 ||
    functions.some((row) => !row ||
      typeof row.signature !== "string" ||
      !row.signature.startsWith("auth_proof_private.") ||
      row.runtime_execute !== false || row.public_execute !== false)) {
    throw new Error("W30_PG17_PRIVATE_ACL_UNPROVEN");
  }
  return true;
}

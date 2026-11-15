// Future *read-only* catalog verification; no client, pool or query is opened.
// These queries are not a release authorization and must be executed only on
// independently owned W9 lease after the original migration113 denial clears.
import {
  PINNED_MIGRATION_SHA256,
  REQUIRED_MIGRATIONS,
  verifyPinnedMigrationSources,
  approvedMigrationChecksums,
} from "./race-migration-pins.mjs";
import {
  isExactW9FirstRollback,
  isW9SecondAttempt,
} from "./race-w9-migration-history.mjs";

export {
  PINNED_MIGRATION_SHA256,
  REQUIRED_MIGRATIONS,
  verifyPinnedMigrationSources,
  approvedMigrationChecksums,
};

export const PG17_RUNTIME_SQL = `
SELECT current_database() AS database,
       current_user AS actor,
       session_user AS session_role,
       pg_backend_pid() AS backend_pid,
       current_setting('server_version_num')::integer AS server_version,
       current_setting('transaction_isolation') AS transaction_isolation,
       current_setting('lock_timeout') AS lock_timeout,
       current_setting('statement_timeout') AS statement_timeout,
       pg_postmaster_start_time() AS server_started,
       pg_is_in_recovery() AS in_recovery,
       pg_get_userbyid(d.datdba) AS database_owner,
       r.rolsuper AS is_superuser,
       r.rolbypassrls AS bypass_rls,
       r.rolcreaterole AS can_create_role
FROM pg_database d
JOIN pg_roles r ON r.rolname = current_user
WHERE d.datname = current_database()`;

export const PG17_MIGRATION_LEDGER_SQL = `
SELECT id, migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count
FROM public._prisma_migrations
ORDER BY started_at, id`;

export const PG17_ADMISSION_ACL_SQL = `
SELECT n.nspname AS private_schema,
       pg_get_userbyid(n.nspowner) AS schema_owner,
       c.relname AS admission_table,
       pg_get_userbyid(c.relowner) AS table_owner,
       has_schema_privilege('issue416_w9_runtime', n.oid, 'CREATE')
         AS runtime_schema_create,
       has_table_privilege('issue416_w9_runtime', c.oid, 'INSERT')
         AS runtime_insert,
       has_table_privilege('issue416_w9_runtime', c.oid, 'UPDATE')
         AS runtime_update,
       has_any_column_privilege('issue416_w9_runtime', c.oid, 'INSERT')
         AS runtime_can_insert_column,
       has_any_column_privilege('issue416_w9_runtime', c.oid, 'UPDATE')
         AS runtime_can_update_column,
       has_table_privilege('issue416_w9_runtime', c.oid, 'DELETE')
         AS runtime_delete,
       has_table_privilege('issue416_w9_runtime', c.oid, 'TRUNCATE')
         AS runtime_truncate,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
         WHERE a.grantee = 0 AND a.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))
         AS public_can_write,
       EXISTS (SELECT 1 FROM pg_attribute a
         CROSS JOIN LATERAL aclexplode(a.attacl) acl
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
           AND acl.grantee = 0 AND acl.privilege_type IN ('INSERT','UPDATE'))
         AS public_can_write_column,
       pg_has_role('issue416_w9_runtime', n.nspowner, 'MEMBER')
         AS runtime_member_of_proof_owner
FROM pg_namespace n
JOIN pg_class c ON c.relnamespace = n.oid
WHERE n.nspname = 'auth_proof_private'
  AND c.relname = 'authority_admissions'
  AND c.relkind IN ('r', 'p')`;

export const PG17_PRIVATE_DEFAULT_ACL_SQL = `
SELECT r.rolname AS default_owner, n.nspname AS default_schema,
       'f' AS object_kind,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(
         (SELECT d.defaclacl FROM pg_default_acl d
          WHERE d.defaclrole = r.oid AND d.defaclnamespace = 0
            AND d.defaclobjtype = 'f'),
         acldefault('f', r.oid))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         AS global_public_execute,
       EXISTS (SELECT 1 FROM pg_default_acl d
         CROSS JOIN LATERAL aclexplode(d.defaclacl) a
         WHERE d.defaclrole = r.oid AND d.defaclnamespace = n.oid
           AND d.defaclobjtype = 'f' AND a.grantee = 0
           AND a.privilege_type = 'EXECUTE') AS schema_public_execute
FROM pg_roles r
JOIN pg_namespace n ON n.nspname = 'auth_proof_private'
WHERE r.rolname = 'vap1_proof_owner'
`;

export const PG17_PRIVATE_FUNCTION_ACL_SQL = `
SELECT p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS function_owner,
       has_function_privilege('issue416_w9_runtime', p.oid, 'EXECUTE')
         AS runtime_can_execute,
       pg_has_role('issue416_w9_runtime', p.proowner, 'MEMBER')
         AS runtime_member_of_function_owner,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(
         p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         AS public_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'auth_proof_private'
ORDER BY p.oid::regprocedure::text`;

export function validateMigrationLedger(rows) {
  const required = verifyPinnedMigrationSources();
  const approved = new Map(required.map((name) => [
    name, approvedMigrationChecksums(name),
  ]));
  if (!Array.isArray(rows) || rows.some((row) => !row)) {
    throw new Error("ISSUE416_RACE_MIGRATION_LEDGER_UNRESOLVED");
  }
  if (rows.filter(isExactW9FirstRollback).length > 1) {
    throw new Error("ISSUE416_RACE_W9_FIRST_ROLLBACK_DUPLICATE");
  }
  for (const row of rows) {
    if (isExactW9FirstRollback(row)) continue;
    if (isW9SecondAttempt(row)) {
      // A known unfinished W9 migration113 is NOT healed by source pinning.
      throw new Error("ISSUE416_RACE_W9_SECOND_113_UNFINISHED_DENIED");
    }
    if (row.finished_at == null || row.rolled_back_at != null) {
      // No unrecognized rollback or unfinished record may bypass admission.
      throw new Error("ISSUE416_RACE_MIGRATION_LEDGER_UNRESOLVED");
    }
    if (
      /^\d{14}_issue416_/.test(row.migration_name) &&
      (!required.includes(row.migration_name) ||
        !approved.get(row.migration_name)?.includes(row.checksum))
    ) {
      throw new Error("ISSUE416_RACE_LEDGER_MIGRATION_CHECKSUM_MISMATCH");
    }
  }
  for (const name of required) {
    const successful = rows.filter(
      (row) =>
        row.migration_name === name &&
        row.finished_at != null &&
        row.rolled_back_at == null &&
        Number.isSafeInteger(row.applied_steps_count) &&
        row.applied_steps_count >= 1 &&
        approved.get(name).includes(row.checksum),
    );
    if (successful.length !== 1) {
      throw new Error("ISSUE416_RACE_REQUIRED_MIGRATION_NOT_COMMITTED");
    }
  }
  return "SOURCE_LEDGER_SHAPE_ONLY";
}

export function validateAdmissionAclRows(admissionRows, defaultRows) {
  if (admissionRows?.length !== 1 || defaultRows?.length !== 1) {
    throw new Error("ISSUE416_RACE_PRIVATE_DDL_ACL_MISSING");
  }
  const admission = admissionRows[0];
  const defaults = defaultRows[0];
  if (
    admission.private_schema !== "auth_proof_private" ||
    admission.admission_table !== "authority_admissions" ||
    admission.schema_owner !== "vap1_proof_owner" ||
    admission.table_owner !== "vap1_proof_owner" ||
    admission.runtime_schema_create !== false ||
    admission.runtime_insert !== false ||
    admission.runtime_update !== false ||
    admission.runtime_can_insert_column !== false ||
    admission.runtime_can_update_column !== false ||
    admission.runtime_delete !== false ||
    admission.runtime_truncate !== false ||
    admission.runtime_member_of_proof_owner !== false ||
    admission.public_can_write !== false ||
    admission.public_can_write_column !== false ||
    defaults.default_owner !== "vap1_proof_owner" ||
    defaults.default_schema !== "auth_proof_private" ||
    defaults.object_kind !== "f" ||
    defaults.global_public_execute !== false ||
    defaults.schema_public_execute !== false
  ) {
    throw new Error("ISSUE416_RACE_PRIVATE_DDL_ACL_DENIED");
  }
  return "SOURCE_ACL_SHAPE_ONLY";
}

export function validatePrivateFunctionAclRows(rows) {
  // Rows from an untrusted caller alone never prove an exhaustive pg_proc scan.
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("ISSUE416_RACE_PRIVATE_FUNCTION_ACL_MISSING");
  }
  const seen = new Set();
  for (const row of rows) {
    if (
      typeof row?.signature !== "string" ||
      !row.signature.startsWith("auth_proof_private.") ||
      seen.has(row.signature) ||
      row.function_owner !== "vap1_proof_owner" ||
      row.runtime_can_execute !== false ||
      row.runtime_member_of_function_owner !== false ||
      row.public_can_execute !== false
    ) {
      throw new Error("ISSUE416_RACE_PRIVATE_FUNCTION_ACL_DENIED");
    }
    seen.add(row.signature);
  }
  return "SOURCE_FUNCTION_ACL_SHAPE_ONLY";
}

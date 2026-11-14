// Future *read-only* catalog verification; no client, pool or query is opened.
// These queries are not a release authorization and must be executed only on
// independently owned W9 lease after the original migration113 denial clears.
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
SELECT migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count, logs
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
       has_table_privilege('issue416_w9_runtime', c.oid, 'DELETE')
         AS runtime_delete,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
         WHERE a.grantee = 0 AND a.privilege_type IN ('INSERT','UPDATE','DELETE'))
         AS public_can_write,
       pg_has_role('issue416_w9_runtime', n.nspowner, 'MEMBER')
         AS runtime_member_of_proof_owner
FROM pg_namespace n
JOIN pg_class c ON c.relnamespace = n.oid
WHERE n.nspname = 'auth_proof_private'
  AND c.relname = 'authority_admissions'
  AND c.relkind IN ('r', 'p')`;

export const PG17_PRIVATE_DEFAULT_ACL_SQL = `
SELECT r.rolname AS default_owner,
       n.nspname AS default_schema,
       d.defaclobjtype AS object_kind,
       EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         AS public_execute
FROM pg_default_acl d
JOIN pg_roles r ON r.oid = d.defaclrole
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE r.rolname = 'vap1_proof_owner'
  AND n.nspname = 'auth_proof_private'
  AND d.defaclobjtype = 'f'`;

export const REQUIRED_MIGRATIONS = Object.freeze([
  "20261113011200_issue416_reserved_security_audit",
  "20261113011300_issue416_vap1_private_foundation",
  "20261113011400_issue416_vap1_private_codec",
  "20261113011500_issue416_vap1_private_lifecycle",
  "20261113011600_issue416_vap1_audit_gate",
  "20261113011700_issue416_vap1_key_boundary_guard",
  "20261113012000_issue416_vap1_atomic_reset_quota",
  "20261113012400_issue416_vap1_atomic_reset_quota_functions",
  "20261113012500_issue416_redeem_scope_contract",
  "20261113012600_issue416_private_reset_credentials",
  "20261113012700_issue416_reset_credential_receipt_binding",
  "20261113012800_issue416_reset_private_reservation_abi",
  "20261113012900_issue416_a01_limiter_fingerprint",
  "20261113013000_issue416_reset_commit_integrity",
]);

export function validateMigrationLedger(rows) {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        (row.finished_at == null && row.rolled_back_at == null) ||
        (row.finished_at != null && row.rolled_back_at != null),
    )
  ) {
    throw new Error("ISSUE416_RACE_MIGRATION_LEDGER_UNRESOLVED");
  }
  for (const name of REQUIRED_MIGRATIONS) {
    const successful = rows.filter(
      (row) =>
        row.migration_name === name &&
        row.finished_at != null &&
        row.rolled_back_at == null &&
        row.applied_steps_count >= 1 &&
        /^[a-f0-9]{64}$/.test(row.checksum),
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
    admission.runtime_delete !== false ||
    admission.runtime_member_of_proof_owner !== false ||
    admission.public_can_write !== false ||
    defaults.default_owner !== "vap1_proof_owner" ||
    defaults.default_schema !== "auth_proof_private" ||
    defaults.object_kind !== "f" ||
    defaults.public_execute !== false
  ) {
    throw new Error("ISSUE416_RACE_PRIVATE_DDL_ACL_DENIED");
  }
  return "SOURCE_ACL_SHAPE_ONLY";
}

import {
  REQUIRED_PRIVATE_FUNCTION_SIGNATURES,
  REQUIRED_PRIVATE_TABLES,
} from "./pg17-acceptance-private-manifest.mjs";

export { REQUIRED_PRIVATE_FUNCTION_SIGNATURES, REQUIRED_PRIVATE_TABLES };
export {
  assertCommittedExactLedger,
  migrationSourceChecksums,
} from "./pg17-acceptance-migration-source.mjs";

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

export {
  ACL_SQL,
  SCHEMA_ACL_SQL,
  FUNCTION_ACL_SQL,
  DEFAULT_FUNCTION_ACL_SQL,
  RELATION_INVENTORY_SQL,
} from "./pg17-acceptance-acl-sql.mjs";

export const OWNER_ROLE_SQL = `
SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb,
       rolcreaterole, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname='vap1_proof_owner'`;

export const OWNER_MEMBERSHIP_SQL = `
SELECT parent.rolname AS granted_role, member.rolname AS member_role,
       grantor.rolname AS grantor_role,
       m.inherit_option, m.set_option, m.admin_option
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid=m.roleid
JOIN pg_roles member ON member.oid=m.member
JOIN pg_roles grantor ON grantor.oid=m.grantor
WHERE parent.rolname='vap1_proof_owner'
   OR member.rolname='vap1_proof_owner'
   OR parent.rolname=$1::name`;

// PG17 records the creator's admin-only grant separately from the explicit
// SET-only, NOINHERIT grant authored by migration113. Both grantors and both
// option tuples must match the actual independently attested fixture.
function exactProofOwnerMembership(rows, migrationOwner, databaseOwner) {
  if (
    !Array.isArray(rows) || rows.length !== 2 ||
    migrationOwner === databaseOwner ||
    ![migrationOwner, databaseOwner].every((role) =>
      typeof role === "string" && role.length > 0)
  ) return false;
  const grants = new Map(rows.map((row) => [row?.grantor_role, row]));
  if (grants.size !== 2) return false;
  for (const [grantor, expected] of [
    [migrationOwner, { inherit_option: false, set_option: true, admin_option: false }],
    [databaseOwner, { inherit_option: false, set_option: false, admin_option: true }],
  ]) {
    const row = grants.get(grantor);
    if (!row || row.granted_role !== "vap1_proof_owner" ||
        row.member_role !== migrationOwner ||
        Object.entries(expected).some(([key, value]) => row[key] !== value)) {
      return false;
    }
  }
  return true;
}

export function assertPrivateAcl(
  rows,
  functions,
  schemas,
  defaults,
  ownerRole,
  ownerMembership,
  migrationOwner = "issue416_w38_migrator",
  relationRows,
  databaseOwner = "issue416_w38_owner",
) {
  const tables = new Set(
    Array.isArray(rows) ? rows.map((row) => row?.table_name) : [],
  );
  const signatures = new Set(
    Array.isArray(functions) ? functions.map((row) => row?.signature) : [],
  );
  const schemaNames = new Set(
    Array.isArray(schemas) ? schemas.map((row) => row?.schema_name) : [],
  );
  const extensionSchemas = Array.isArray(schemas)
    ? schemas.filter((row) => row?.is_pgcrypto_extension === true)
    : [];
  const privateSchema = Array.isArray(schemas)
    ? schemas.find((row) => row?.schema_name === "auth_proof_private")
    : undefined;
  const cryptoSchema = Array.isArray(schemas)
    ? schemas.find((row) => row?.schema_name === "auth_proof_crypto")
    : undefined;
  const extensionSchema = extensionSchemas[0];
  const relationNames = new Set(
    Array.isArray(relationRows)
      ? relationRows.map((r) => r?.relation_name)
      : [],
  );
  if (
    !Array.isArray(relationRows) ||
    relationRows.length !== 50 ||
    relationNames.size !== relationRows.length ||
    relationRows.some(
      (row) =>
        !row ||
        row.schema_name !== "auth_proof_private" ||
        row.relation_kind !== "i" ||
        row.relation_owner !== "vap1_proof_owner" ||
        row.parent_schema !== "auth_proof_private" ||
        row.parent_owner !== "vap1_proof_owner" ||
        !REQUIRED_PRIVATE_TABLES.includes(row.parent_table),
    ) ||
    !Array.isArray(rows) ||
    rows.length < REQUIRED_PRIVATE_TABLES.length ||
    tables.size !== rows.length ||
    tables.size !== REQUIRED_PRIVATE_TABLES.length ||
    REQUIRED_PRIVATE_TABLES.some((name) => !tables.has(name)) ||
    rows.some(
      (row) =>
        !row ||
        row.schema_name !== "auth_proof_private" ||
        row.relation_kind !== "r" ||
        row.table_owner !== "vap1_proof_owner" ||
        [
          "select_allowed",
          "insert_allowed",
          "update_allowed",
          "delete_allowed",
          "truncate_allowed",
          "column_select_allowed",
          "column_insert_allowed",
          "column_update_allowed",
          "owner_membership",
          "public_column_allowed",
          "public_table_allowed",
          "nonowner_table_allowed",
          "nonowner_column_allowed",
        ].some((field) => row[field] !== false),
    ) ||
    !Array.isArray(schemas) ||
    extensionSchemas.length !== 1 ||
    schemas.length !== 2 ||
    schemaNames.size !== schemas.length ||
    !schemaNames.has("auth_proof_private") ||
    !schemaNames.has("auth_proof_crypto") ||
    !privateSchema ||
    privateSchema.schema_owner !== "vap1_proof_owner" ||
    privateSchema.owner_membership !== false ||
    privateSchema.runtime_usage !== false ||
    privateSchema.runtime_create !== false ||
    privateSchema.public_usage !== false ||
    privateSchema.public_create !== false ||
    privateSchema.nonowner_create_allowed !== false ||
    privateSchema.untrusted_schema_usage !== false ||
    privateSchema.schema_owner_superuser !== false ||
    !cryptoSchema ||
    cryptoSchema.schema_owner !== migrationOwner ||
    cryptoSchema.owner_membership !== false ||
    cryptoSchema.runtime_usage !== false ||
    cryptoSchema.runtime_create !== false ||
    cryptoSchema.public_usage !== false ||
    cryptoSchema.public_create !== false ||
    cryptoSchema.nonowner_create_allowed !== false ||
    cryptoSchema.untrusted_schema_usage !== false ||
    cryptoSchema.schema_owner_superuser !== false ||
    !extensionSchema ||
    extensionSchema.schema_name !== "auth_proof_crypto" ||
    extensionSchema.extension_owner !== migrationOwner ||
    extensionSchema.schema_owner !== migrationOwner ||
    extensionSchema.owner_membership !== false ||
    extensionSchema.runtime_create !== false ||
    extensionSchema.public_create !== false ||
    extensionSchema.nonowner_create_allowed !== false ||
    extensionSchema.extension_owner_superuser !== false ||
    !Array.isArray(functions) ||
    functions.length !== REQUIRED_PRIVATE_FUNCTION_SIGNATURES.length ||
    signatures.size !== functions.length ||
    REQUIRED_PRIVATE_FUNCTION_SIGNATURES.some(
      (signature) => !signatures.has(signature),
    ) ||
    functions.some(
      (row) =>
        !row ||
        typeof row.signature !== "string" ||
        !row.signature.startsWith("auth_proof_private.") ||
        row.function_kind !== "f" ||
        row.function_owner !== "vap1_proof_owner" ||
        row.owner_membership !== false ||
        row.runtime_execute !== false ||
        row.public_execute !== false ||
        row.nonowner_execute !== false,
    ) ||
    !Array.isArray(defaults) ||
    defaults.length !== 1 ||
    defaults[0]?.default_owner !== "vap1_proof_owner" ||
    defaults[0]?.default_schema !== "auth_proof_private" ||
    defaults[0]?.global_public_execute !== false ||
    defaults[0]?.global_nonowner_execute !== false ||
    defaults[0]?.schema_public_execute !== false ||
    defaults[0]?.schema_nonowner_execute !== false ||
    !Array.isArray(ownerRole) ||
    ownerRole.length !== 1 ||
    ownerRole[0]?.rolname !== "vap1_proof_owner" ||
    [
      "rolcanlogin",
      "rolinherit",
      "rolsuper",
      "rolcreatedb",
      "rolcreaterole",
      "rolreplication",
      "rolbypassrls",
    ].some((field) => ownerRole[0][field] !== false) ||
    !exactProofOwnerMembership(ownerMembership, migrationOwner, databaseOwner)
  ) {
    throw new Error("W30_PG17_PRIVATE_ACL_UNPROVEN");
  }
  return true;
}

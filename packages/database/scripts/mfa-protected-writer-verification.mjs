import {
  mfaFactorInsertColumns,
  mfaFactorUpdateColumns,
  mfaRecoveryInsertColumns,
} from "./mfa-runtime-privileges.mjs";
import {
  mfaProtectedWriterSelectColumns,
  mfaProtectedWriterSessionUpdateColumns,
  mfaProtectedWriterTables,
  mfaProtectedWriterUserLockColumn,
} from "./mfa-protected-writer-contract.mjs";
import { verifyMfaProtectedWriterFunctions } from "./mfa-protected-writer-function-verification.mjs";
import { verifyMfaProtectedWriterRole } from "./mfa-protected-writer-role-verification.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";

const tablePrivileges = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];
const columnPrivileges = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];

function expectedColumns(table) {
  return {
    SELECT: mfaProtectedWriterSelectColumns[table] ?? [],
    INSERT:
      table === "user_mfa_totp_factors"
        ? mfaFactorInsertColumns
        : table === "mfa_recovery_codes"
          ? mfaRecoveryInsertColumns
          : [],
    UPDATE:
      table === "users"
        ? [mfaProtectedWriterUserLockColumn]
        : table === "staff_auth_sessions"
          ? mfaProtectedWriterSessionUpdateColumns
          : table === "user_mfa_totp_factors"
            ? mfaFactorUpdateColumns
            : table === "mfa_recovery_codes"
              ? ["consumed_at"]
              : [],
    REFERENCES: [],
  };
}

async function assertNoTablePrivileges(client, role, table) {
  const result = await client.query(
    `SELECT privilege,pg_catalog.has_table_privilege(
       $1,pg_catalog.format('public.%I',$2::text),privilege
     ) AS allowed
     FROM unnest($3::text[]) AS privilege`,
    [role, table, tablePrivileges],
  );
  if (
    result.rows.length !== tablePrivileges.length ||
    result.rows.some((row) => row.allowed !== false)
  ) {
    throw new Error(`MFA writer has table-level authority on public.${table}.`);
  }
}
async function assertNoOtherPrivileges(client, role) {
  const tables = await client.query(
    `SELECT namespace.nspname,relation.relname,privilege
     FROM pg_catalog.pg_class relation
     JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
     CROSS JOIN unnest($2::text[]) AS privilege
     WHERE relation.relkind IN ('r','p','v','m','f')
       AND namespace.nspname NOT IN ('pg_catalog','information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND pg_catalog.has_table_privilege(
         $1,relation.oid,privilege
       )
     LIMIT 1`,
    [role, tablePrivileges],
  );
  const columns = await client.query(
    `SELECT namespace.nspname,relation.relname,attribute.attname,privilege
     FROM pg_catalog.pg_attribute attribute
     JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
     JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
     CROSS JOIN unnest($2::text[]) AS privilege
     WHERE attribute.attnum>0 AND NOT attribute.attisdropped
       AND relation.relkind IN ('r','p','v','m','f')
       AND namespace.nspname NOT IN ('pg_catalog','information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND NOT (namespace.nspname='public' AND relation.relname=ANY($3::text[]))
       AND pg_catalog.has_column_privilege(
         $1,relation.oid,attribute.attname,privilege
       )
     LIMIT 1`,
    [role, columnPrivileges, mfaProtectedWriterTables],
  );
  if (tables.rowCount !== 0 || columns.rowCount !== 0) {
    throw new Error(
      "MFA writer has unexpected table or column privileges outside its exact MFA inventory.",
    );
  }
}
async function assertNoSequencePrivileges(client, role) {
  const result = await client.query(
    `SELECT namespace.nspname,sequence.relname,privilege
     FROM pg_catalog.pg_class sequence
     JOIN pg_catalog.pg_namespace namespace ON namespace.oid=sequence.relnamespace
     CROSS JOIN unnest($2::text[]) AS privilege
     WHERE sequence.relkind='S'
       AND namespace.nspname NOT IN ('pg_catalog','information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND pg_catalog.has_sequence_privilege($1,sequence.oid,privilege)
     LIMIT 1`,
    [role, ["USAGE", "SELECT", "UPDATE"]],
  );
  if (result.rowCount !== 0) {
    throw new Error("MFA writer has unexpected sequence privileges.");
  }
}
async function assertExactColumns(client, role, table) {
  const result = await client.query(
    `SELECT column_name,privilege,
            pg_catalog.has_column_privilege(
              $1,pg_catalog.format('public.%I',$2::text),column_name,privilege
            ) AS allowed
     FROM information_schema.columns
     CROSS JOIN unnest($3::text[]) AS privilege
     WHERE table_schema='public' AND table_name=$2
     ORDER BY ordinal_position,privilege`,
    [role, table, columnPrivileges],
  );
  const expected = expectedColumns(table);
  if (
    result.rowCount === 0 ||
    result.rows.some(
      (row) =>
        row.allowed !==
        (expected[row.privilege] ?? []).includes(row.column_name),
    )
  ) {
    throw new Error(
      `MFA writer ${table} column privilege inventory is not exact.`,
    );
  }
}
async function assertPublicDenied(client, table) {
  const result = await client.query(
    `SELECT 1 FROM pg_catalog.pg_class relation
     JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
     LEFT JOIN LATERAL pg_catalog.aclexplode(COALESCE(
       relation.relacl,pg_catalog.acldefault('r',relation.relowner)
     )) table_acl ON true
     LEFT JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=relation.oid
       AND attribute.attnum>0 AND NOT attribute.attisdropped
     LEFT JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) column_acl ON true
     WHERE namespace.nspname='public' AND relation.relname=$1
       AND ((table_acl.grantee=0 AND table_acl.privilege_type=ANY($2::text[]))
         OR (column_acl.grantee=0 AND column_acl.privilege_type=ANY($3::text[])))
     LIMIT 1`,
    [table, tablePrivileges, columnPrivileges],
  );
  if (result.rowCount !== 0) {
    throw new Error(`PUBLIC retains privileges on MFA table public.${table}.`);
  }
}
export async function verifyMfaProtectedWriterPrivileges(
  client,
  runtimeRole,
  migrationRole,
  writerRole = optionCRoles.mfaWriter,
) {
  await verifyMfaProtectedWriterRole(client, writerRole, migrationRole);
  const passwordHash = await client.query(
    "SELECT pg_catalog.has_column_privilege($1,'public.users','password_hash','SELECT') AS allowed",
    [writerRole],
  );
  if (passwordHash.rows[0]?.allowed !== false) {
    throw new Error("MFA writer must never SELECT public.users.password_hash.");
  }
  for (const table of mfaProtectedWriterTables) {
    await assertNoTablePrivileges(client, writerRole, table);
    await assertExactColumns(client, writerRole, table);
    await assertPublicDenied(client, table);
  }
  await assertNoOtherPrivileges(client, writerRole);
  await assertNoSequencePrivileges(client, writerRole);
  await verifyMfaProtectedWriterFunctions(
    client,
    writerRole,
    runtimeRole,
    migrationRole,
  );
}

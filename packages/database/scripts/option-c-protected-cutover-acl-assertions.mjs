import { tableMutationContract } from "./option-c-protected-cutover-acl-contract.mjs";

async function tableColumns(client, table) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  if (result.rowCount === 0)
    throw new Error(`Option C required table ${table} is missing.`);
  return result.rows.map(({ column_name }) => column_name);
}

export async function assertExactMutationColumns(
  client,
  role,
  table,
  expected,
) {
  const columns = await tableColumns(client, table);
  for (const privilege of ["INSERT", "UPDATE"]) {
    const tableAcl = await client.query(
      "SELECT has_table_privilege($1,$2,$3) AS allowed",
      [role, `public.${table}`, privilege],
    );
    if (tableAcl.rows[0]?.allowed !== false) {
      throw new Error(
        `Option C ${role} has table-level ${table} ${privilege}.`,
      );
    }
    const allowed = new Set(expected[privilege] ?? []);
    for (const column of columns) {
      const found = await client.query(
        "SELECT has_column_privilege($1,$2,$3,$4) AS allowed",
        [role, `public.${table}`, column, privilege],
      );
      if (found.rows[0]?.allowed !== allowed.has(column)) {
        throw new Error(
          `Option C ${role} ${table}.${column} ${privilege} is unsafe.`,
        );
      }
    }
  }
}

export async function assertPublicMutationDenied(client) {
  const result = await client.query(
    `SELECT 1 FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
       LEFT JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=relation.oid
         AND attribute.attnum>0 AND NOT attribute.attisdropped
       LEFT JOIN LATERAL pg_catalog.aclexplode(relation.relacl) table_acl ON true
       LEFT JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) column_acl ON true
       WHERE namespace.nspname='public' AND relation.relname=ANY($1::text[])
         AND ((table_acl.grantee=0 AND table_acl.privilege_type IN
           ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')) OR
              (column_acl.grantee=0 AND column_acl.privilege_type IN
           ('INSERT','UPDATE','REFERENCES')))
       LIMIT 1`,
    [Object.keys(tableMutationContract)],
  );
  if (result.rowCount !== 0)
    throw new Error("PUBLIC retains Option C sensitive authority.");
}

export async function assertNoDestructiveTablePrivileges(client, roles) {
  for (const role of roles) {
    for (const table of Object.keys(tableMutationContract)) {
      const result = await client.query(
        `SELECT has_table_privilege($1,$2,'DELETE') AS can_delete,
                has_table_privilege($1,$2,'TRUNCATE') AS can_truncate,
                has_table_privilege($1,$2,'REFERENCES') AS can_reference,
                has_table_privilege($1,$2,'TRIGGER') AS can_trigger`,
        [role, `public.${table}`],
      );
      if (!result.rows[0] || Object.values(result.rows[0]).some(Boolean)) {
        throw new Error(`Option C ${role} has destructive ${table} authority.`);
      }
    }
  }
}

export async function assertProtectedFunction(
  client,
  signature,
  allowedRole,
  deniedRoles,
  path,
) {
  const metadata = await client.query(
    `SELECT function.prosecdef,owner.rolname AS owner,function.proconfig,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
                AND acl.is_grantable) AS grant_option_denied,
            NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(
              COALESCE(function.proacl,pg_catalog.acldefault('f',function.proowner))) acl
              WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
                AND acl.grantee<>0 AND ($2::text IS NULL OR acl.grantee <>
                  (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$2))) AS other_roles_denied
       FROM pg_catalog.pg_proc function JOIN pg_catalog.pg_roles owner
         ON owner.oid=function.proowner WHERE function.oid=pg_catalog.to_regprocedure($1)`,
    [signature, allowedRole],
  );
  const row = metadata.rows[0];
  if (
    metadata.rowCount !== 1 ||
    row?.prosecdef !== true ||
    row.public_denied !== true ||
    row.grant_option_denied !== true ||
    row.other_roles_denied !== true ||
    deniedRoles.includes(row.owner) ||
    !Array.isArray(row.proconfig) ||
    !row.proconfig.includes(path)
  ) {
    throw new Error(
      `Option C protected function ${signature} metadata is unsafe.`,
    );
  }
  const checkedRoles =
    allowedRole === null ? deniedRoles : [allowedRole, ...deniedRoles];
  for (const role of checkedRoles) {
    const access = await client.query(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",
      [role, signature],
    );
    if (
      access.rows[0]?.allowed !== (allowedRole !== null && role === allowedRole)
    ) {
      throw new Error(
        `Option C protected function ${signature} ACL is unsafe.`,
      );
    }
  }
}

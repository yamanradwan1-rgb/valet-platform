export async function grantMfaColumns(
  client,
  formatted,
  role,
  privilege,
  table,
  columns,
) {
  for (const column of columns) {
    await formatted(
      client,
      `GRANT ${privilege} (%I) ON TABLE public.%I TO %I`,
      [column, table, role],
    );
  }
}

async function revokeColumnPrivileges(
  client,
  formatted,
  role,
  schema,
  table,
  columns,
) {
  for (const column of columns) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
      const sql =
        role === "PUBLIC"
          ? `REVOKE ${privilege} (%I) ON TABLE %I.%I FROM PUBLIC`
          : `REVOKE ${privilege} (%I) ON TABLE %I.%I FROM %I`;
      await formatted(
        client,
        sql,
        role === "PUBLIC"
          ? [column, schema, table]
          : [column, schema, table, role],
      );
    }
  }
}

export async function revokeAllSchemaColumnPrivileges(
  client,
  formatted,
  role,
  schema,
) {
  const result = await client.query(
    `SELECT table_name,column_name FROM information_schema.columns
     WHERE table_schema=$1 ORDER BY table_name,ordinal_position`,
    [schema],
  );
  const byTable = new Map();
  for (const { table_name, column_name } of result.rows) {
    if (!byTable.has(table_name)) byTable.set(table_name, []);
    byTable.get(table_name).push(column_name);
  }
  for (const [table, columns] of byTable) {
    await revokeColumnPrivileges(
      client,
      formatted,
      role,
      schema,
      table,
      columns,
    );
  }
}

export async function revokeAllTableColumnPrivileges(
  client,
  formatted,
  role,
  schema,
  table,
) {
  const result = await client.query(
    "SELECT column_name FROM information_schema.columns " +
      "WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",
    [schema, table],
  );
  if (result.rowCount === 0) {
    throw new Error(`MFA ACL target ${schema}.${table} is missing.`);
  }
  await revokeColumnPrivileges(
    client,
    formatted,
    role,
    schema,
    table,
    result.rows.map(({ column_name }) => column_name),
  );
}

export async function revokeUnexpectedMfaExecutors(
  client,
  formatted,
  signature,
  allowedRoles,
) {
  const result = await client.query(
    "SELECT DISTINCT grantee.rolname AS role_name " +
      "FROM pg_catalog.pg_proc function " +
      "CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(" +
      "function.proacl,pg_catalog.acldefault('f',function.proowner))) acl " +
      "JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee " +
      "WHERE function.oid=pg_catalog.to_regprocedure($1) " +
      "AND acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner " +
      "AND NOT (grantee.rolname=ANY($2::text[])) ORDER BY grantee.rolname",
    [signature, allowedRoles],
  );
  for (const { role_name } of result.rows) {
    await formatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [
      role_name,
    ]);
  }
}

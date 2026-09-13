export async function tablePrivilegeMatches(
  client,
  runtimeRole,
  policy,
  verifyRefundInsert,
) {
  const [table, privilege, expected] = policy;
  const result = await client.query(
    `SELECT has_table_privilege($1, $2, $3) AS allowed`,
    [runtimeRole, table, privilege],
  );
  return (
    result.rows[0]?.allowed === expected &&
    (table !== "public.refunds" ||
      privilege !== "INSERT" ||
      (await verifyRefundInsert(client, runtimeRole)))
  );
}

export async function columnPrivilegeMatches(client, runtimeRole, policy) {
  const [table, column, expected] = policy;
  const result = await client.query(
    `SELECT has_column_privilege($1, $2, $3, 'UPDATE') AS allowed`,
    [runtimeRole, table, column],
  );
  return result.rows[0]?.allowed === expected;
}

export async function anyColumnPrivilegeMatches(client, runtimeRole, policy) {
  const [table, privilege, expected] = policy;
  const result = await client.query(
    `SELECT has_any_column_privilege($1, $2, $3) AS allowed`,
    [runtimeRole, table, privilege],
  );
  return result.rows[0]?.allowed === expected;
}

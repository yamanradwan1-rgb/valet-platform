/** Retire explicit EXECUTE grants to every unexpected non-owner PostgreSQL role. */
export async function revokeUnexpectedFunctionExecutors(client, formatted, signature, allowedRole) {
  const result = await client.query(
    `SELECT DISTINCT grantee.rolname AS role_name
       FROM pg_catalog.pg_proc AS function
       CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
         function.proacl,pg_catalog.acldefault('f',function.proowner))) AS acl
       JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=acl.grantee
       WHERE function.oid=pg_catalog.to_regprocedure($1)
         AND acl.privilege_type='EXECUTE'
         AND acl.grantee<>function.proowner
         AND ($2::text IS NULL OR grantee.rolname<>$2)
       ORDER BY grantee.rolname`,
    [signature, allowedRole],
  );
  for (const { role_name } of result.rows) {
    await formatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [role_name]);
  }
}

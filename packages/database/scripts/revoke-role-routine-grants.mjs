export async function revokeDirectFunctionGrants(client, executeFormatted, role) {
  // Restrict REVOKE to actual grants. Other NOLOGIN owners control unrelated
  // functions, and the migration owner has no authority to edit those ACLs.
  const inventory = `SELECT format('%I.%I(%s)', namespace.nspname, routine.proname,
                                   pg_get_function_identity_arguments(routine.oid)) AS signature
    FROM pg_proc routine JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    CROSS JOIN LATERAL aclexplode(routine.proacl) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public' AND acl.privilege_type = 'EXECUTE'
      AND grantee.rolname = $1`;
  const { rows } = await client.query(inventory, [role]);
  for (const { signature } of rows) {
    await executeFormatted(client, "REVOKE ALL ON ROUTINE %s FROM %I", [signature, role]);
  }
  const remaining = await client.query(inventory, [role]);
  if (remaining.rows.length !== 0) {
    throw new Error("Role retains unexpected direct function grants.");
  }
}

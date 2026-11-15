// To be called by S01/S02 *independent* writer provisioners within their own
// transaction. Ordinary DATABASE_URL must never acquire these EXECUTE grants.
export const s04ProtectedWriterSignatures = {
  staffAuth: "public.s04_staff_login_success(uuid,text)",
  staffActivation: "public.s04_staff_activation_success(uuid,text,text,text,xid8,uuid,bigint,text)",
  mfa: "public.s04_mfa_success(uuid,text,text)",
};

export async function grantS04ProtectedWriterFunction(
  client,
  executeFormatted,
  purpose,
  protectedRole,
  ordinaryRole,
) {
  if (protectedRole === ordinaryRole ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(protectedRole)) {
    throw new Error("S04 protected writer requires a separate restricted role.");
  }
  const signature = s04ProtectedWriterSignatures[purpose];
  if (!signature) throw new Error("Unknown S04 protected writer purpose.");
  await client.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
  await executeFormatted(client, `REVOKE ALL ON FUNCTION ${signature} FROM %I`, [ordinaryRole]);
  await executeFormatted(client, `GRANT EXECUTE ON FUNCTION ${signature} TO %I`, [protectedRole]);
  const result = await client.query(
    `SELECT has_function_privilege($1,$3,'EXECUTE') AS writer,
            NOT has_function_privilege($2,$3,'EXECUTE') AS ordinary_denied,
            EXISTS (
              SELECT 1 FROM pg_catalog.pg_proc function
              CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
                function.proacl,pg_catalog.acldefault('f',function.proowner)
              )) acl
              WHERE function.oid=pg_catalog.to_regprocedure($3)
                AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
            ) AS public_allowed
     FROM pg_roles WHERE rolname=$1`,
    [protectedRole, ordinaryRole, signature],
  );
  if (result.rowCount !== 1 || result.rows[0]?.writer !== true ||
      result.rows[0]?.ordinary_denied !== true ||
      result.rows[0]?.public_allowed !== false) {
    throw new Error("S04 protected writer scope cannot be attested.");
  }
}

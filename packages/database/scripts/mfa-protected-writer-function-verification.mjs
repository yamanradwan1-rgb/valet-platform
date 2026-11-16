import { mfaProtectedWriterFunctions } from "./mfa-protected-writer-contract.mjs";
import { optionCRoles } from "./option-c-protected-cutover-state.mjs";

async function assertFunction(
  client,
  writerRole,
  runtimeRole,
  migrationRole,
  signature,
  allowedRoles,
  path,
) {
  const result = await client.query(
    `SELECT function.prosecdef,owner.rolname AS owner,function.proconfig,
       pg_catalog.has_function_privilege($2,function.oid,'EXECUTE') AS writer,
       pg_catalog.has_function_privilege($3,function.oid,'EXECUTE') AS runtime,
       COALESCE((SELECT pg_catalog.has_function_privilege($4,function.oid,'EXECUTE')
         FROM pg_catalog.pg_roles WHERE rolname=$4),false) AS staff,
       COALESCE((SELECT pg_catalog.has_function_privilege($5,function.oid,'EXECUTE')
         FROM pg_catalog.pg_roles WHERE rolname=$5),false) AS management,
       NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
         function.proacl,pg_catalog.acldefault('f',function.proowner)
       )) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied,
       NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
         function.proacl,pg_catalog.acldefault('f',function.proowner)
       )) acl WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
         AND acl.is_grantable) AS grant_option_denied,
       NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
         function.proacl,pg_catalog.acldefault('f',function.proowner)
       )) acl WHERE acl.privilege_type='EXECUTE' AND acl.grantee<>function.proowner
         AND acl.grantee<>0 AND acl.grantee NOT IN (
           SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($6::text[])
         )) AS other_roles_denied
     FROM pg_catalog.pg_proc function
     JOIN pg_catalog.pg_roles owner ON owner.oid=function.proowner
     WHERE function.oid=pg_catalog.to_regprocedure($1)`,
    [
      signature,
      writerRole,
      runtimeRole,
      optionCRoles.staffAuthWriter,
      optionCRoles.managementWriter,
      allowedRoles,
    ],
  );
  const row = result.rows[0];
  const expected = {
    writer: allowedRoles.includes(writerRole),
    runtime: allowedRoles.includes(runtimeRole),
    staff: allowedRoles.includes(optionCRoles.staffAuthWriter),
    management: allowedRoles.includes(optionCRoles.managementWriter),
  };
  if (
    result.rowCount !== 1 ||
    row?.prosecdef !== true ||
    row.owner !== migrationRole ||
    row.public_denied !== true ||
    row.grant_option_denied !== true ||
    row.other_roles_denied !== true ||
    !Array.isArray(row.proconfig) ||
    row.proconfig.length !== 1 ||
    row.proconfig[0] !== path ||
    Object.entries(expected).some(([key, value]) => row[key] !== value)
  ) {
    throw new Error(`MFA writer function ACL is unsafe: ${signature}.`);
  }
}

async function assertNoUnexpectedFunctions(client, writerRole) {
  const unexpected = await client.query(
    `SELECT 1 FROM pg_catalog.pg_proc function
     JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace
     CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
       function.proacl,pg_catalog.acldefault('f',function.proowner)
     )) acl
     WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND acl.grantee=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1)
       AND acl.privilege_type='EXECUTE'
       AND function.oid NOT IN (
         pg_catalog.to_regprocedure($2),pg_catalog.to_regprocedure($3)
       )
     LIMIT 1`,
    [
      writerRole,
      mfaProtectedWriterFunctions.quotaSuccess,
      mfaProtectedWriterFunctions.accountSecurityAudit,
    ],
  );
  if (unexpected.rowCount !== 0) {
    throw new Error("MFA writer has an unexpected direct function grant.");
  }
  const exposedDefiner = await client.query(
    `SELECT function.oid::regprocedure::text AS signature
     FROM pg_catalog.pg_proc function
     JOIN pg_catalog.pg_namespace namespace ON namespace.oid=function.pronamespace
     WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
       AND namespace.nspname NOT LIKE 'pg_toast%'
       AND namespace.nspname NOT LIKE 'pg_temp_%'
       AND function.prosecdef
       AND pg_catalog.has_function_privilege($1,function.oid,'EXECUTE')
       AND function.oid NOT IN (
         pg_catalog.to_regprocedure($2),pg_catalog.to_regprocedure($3)
       )
     LIMIT 1`,
    [
      writerRole,
      mfaProtectedWriterFunctions.quotaSuccess,
      mfaProtectedWriterFunctions.accountSecurityAudit,
    ],
  );
  if (exposedDefiner.rowCount !== 0) {
    throw new Error(
      `MFA writer can execute an unexpected SECURITY DEFINER function: ${exposedDefiner.rows[0].signature}.`,
    );
  }
}

async function assertPrivateFunctionsDenied(client, writerRole) {
  const privateAccess = await client.query(
    `SELECT pg_catalog.has_schema_privilege($1,'mfa_activity_private','USAGE') AS activity,
            pg_catalog.has_schema_privilege($1,'s04_quota_guard','USAGE') AS quota,
            pg_catalog.has_schema_privilege($1,'auth_proof_private','USAGE') AS proof,
            pg_catalog.has_function_privilege($1,
              'mfa_activity_private.touch_admin_activity(uuid,uuid,text,uuid,integer,text,bigint,bytea)',
              'EXECUTE') AS touch`,
    [writerRole],
  );
  if (
    privateAccess.rowCount !== 1 ||
    Object.values(privateAccess.rows[0] ?? {}).some(Boolean)
  ) {
    throw new Error("MFA writer can access a private proof/activity boundary.");
  }
  for (const signature of [
    "public.mfa_totp_factor_guard()",
    "public.mfa_recovery_code_guard()",
    "public.mfa_pending_session_owner_guard()",
  ]) {
    const access = await client.query(
      `SELECT pg_catalog.has_function_privilege($1,function.oid,'EXECUTE') AS allowed,
              NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
                function.proacl,pg_catalog.acldefault('f',function.proowner)
              )) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_denied
       FROM pg_catalog.pg_proc function
       WHERE function.oid=pg_catalog.to_regprocedure($2)`,
      [writerRole, signature],
    );
    if (
      access.rowCount !== 1 ||
      access.rows[0]?.allowed !== false ||
      access.rows[0]?.public_denied !== true
    ) {
      throw new Error(
        `MFA writer can execute trigger-only function ${signature}.`,
      );
    }
  }
}

export async function verifyMfaProtectedWriterFunctions(
  client,
  writerRole,
  runtimeRole,
  migrationRole,
) {
  await assertFunction(
    client,
    writerRole,
    runtimeRole,
    migrationRole,
    mfaProtectedWriterFunctions.quotaSuccess,
    [writerRole],
    "search_path=pg_catalog",
  );
  await assertFunction(
    client,
    writerRole,
    runtimeRole,
    migrationRole,
    mfaProtectedWriterFunctions.accountSecurityAudit,
    [writerRole, runtimeRole],
    "search_path=pg_catalog, public",
  );
  await assertNoUnexpectedFunctions(client, writerRole);
  await assertPrivateFunctionsDenied(client, writerRole);
}

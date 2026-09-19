const accountSecurityRuntimeAppendFunction =
  "public.append_runtime_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,timestamp with time zone)";
const accountSecurityControlledAppendFunction =
  "public.append_account_security_audit_event(uuid,text,uuid,account_security_actor_type,uuid,text,timestamp with time zone)";

async function hasPrivileges(client, role, table, expected) {
  const result = await client.query(
    `SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
            has_table_privilege($1, $2, 'INSERT') AS can_insert,
            has_table_privilege($1, $2, 'UPDATE') AS can_update,
            has_table_privilege($1, $2, 'DELETE') AS can_delete,
            has_table_privilege($1, $2, 'TRUNCATE') AS can_truncate,
            has_table_privilege($1, $2, 'REFERENCES') AS can_reference,
            has_table_privilege($1, $2, 'TRIGGER') AS can_trigger`,
    [role, table],
  );
  const row = result.rows[0];
  return (
    row?.can_select === expected.select &&
    row.can_insert === expected.insert &&
    row.can_update === false &&
    row.can_delete === false &&
    row.can_truncate === false &&
    row.can_reference === false &&
    row.can_trigger === false
  );
}

async function publicAccessDenied(client, table) {
  const result = await client.query(
    `SELECT NOT EXISTS (
       SELECT 1
       FROM pg_class AS relation
       CROSS JOIN LATERAL aclexplode(
         COALESCE(relation.relacl, acldefault('r', relation.relowner))
       ) AS privilege
       WHERE relation.oid = $1::regclass
         AND privilege.grantee = 0
         AND privilege.privilege_type IN (
           'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
           'REFERENCES', 'TRIGGER'
         )
     ) AS denied`,
    [table],
  );
  return result.rows[0]?.denied === true;
}

async function publicColumnAccessDenied(client, table) {
  const result = await client.query(
    `SELECT NOT EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege
       WHERE attribute.attrelid = $1::regclass
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
         AND privilege.grantee = 0
         AND privilege.privilege_type IN (
           'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
         )
     ) AS denied`,
    [table],
  );
  return result.rows[0]?.denied === true;
}

async function verifyAppendFunction(
  client,
  runtimeRole,
  functionName,
  runtimeAllowed,
) {
  const result = await client.query(
    `SELECT has_function_privilege($1, $2, 'EXECUTE') AS runtime_allowed,
            function.prosecdef AS security_definer,
            owner.rolname <> $1 AS owner_safe,
            function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
              AS search_path_safe,
            NOT EXISTS (
              SELECT 1
              FROM aclexplode(
                COALESCE(function.proacl, acldefault('f', function.proowner))
              ) AS privilege
              INNER JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
              WHERE grantee.rolname = $1
                AND privilege.privilege_type = 'EXECUTE'
                AND privilege.is_grantable
            ) AS runtime_grant_option_denied,
            NOT EXISTS (
              SELECT 1
              FROM aclexplode(
                COALESCE(function.proacl, acldefault('f', function.proowner))
              ) AS privilege
              WHERE privilege.grantee = 0
                AND privilege.privilege_type = 'EXECUTE'
            ) AS public_denied
     FROM pg_proc AS function
     INNER JOIN pg_roles AS owner ON owner.oid = function.proowner
     WHERE function.oid = to_regprocedure($2)`,
    [runtimeRole, functionName],
  );
  const row = result.rows[0];
  return (
    row?.runtime_allowed === runtimeAllowed &&
    row.security_definer === true &&
    row.owner_safe === true &&
    row.search_path_safe === true &&
    row.runtime_grant_option_denied === true &&
    row.public_denied === true
  );
}

export async function verifyAuditFoundationPrivileges(client, runtimeRole) {
  const tenantSafe = await hasPrivileges(
    client,
    runtimeRole,
    "public.audit_events",
    { insert: false, select: true },
  );
  const tenantColumns = await client.query(
    `SELECT column_name,
            has_column_privilege($1, 'public.audit_events', column_name, 'SELECT')
              AS can_select,
            has_column_privilege($1, 'public.audit_events', column_name, 'INSERT')
              AS can_insert,
            has_column_privilege($1, 'public.audit_events', column_name, 'UPDATE')
              AS can_update,
            has_column_privilege($1, 'public.audit_events', column_name, 'REFERENCES')
              AS can_reference
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_events'`,
    [runtimeRole],
  );
  const tenantAllowedInsertColumns = new Set([
    "id",
    "organization_id",
    "location_id",
    "valet_session_id",
    "actor_membership_id",
    "actor_type",
    "event_type",
    "entity_type",
    "entity_id",
    "metadata_json",
    "idempotency_key",
    "occurred_at",
  ]);
  const tenantColumnsSafe =
    tenantColumns.rows.length === 15 &&
    tenantColumns.rows.every(
      (row) =>
        row.can_select === true &&
        row.can_insert === tenantAllowedInsertColumns.has(row.column_name) &&
        row.can_update === false &&
        row.can_reference === false,
    );
  const accountSafe = await hasPrivileges(
    client,
    runtimeRole,
    "public.account_security_audit_events",
    { insert: false, select: false },
  );
  const accountColumns = await client.query(
    `SELECT column_name,
            has_column_privilege(
              $1, 'public.account_security_audit_events', column_name, 'SELECT'
            ) AS can_select,
            has_column_privilege(
              $1, 'public.account_security_audit_events', column_name, 'INSERT'
            ) AS can_insert,
            has_column_privilege(
              $1, 'public.account_security_audit_events', column_name, 'UPDATE'
            ) AS can_update,
            has_column_privilege(
              $1, 'public.account_security_audit_events', column_name, 'REFERENCES'
            ) AS can_reference
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'account_security_audit_events'`,
    [runtimeRole],
  );
  const accountColumnsSafe =
    accountColumns.rows.length === 8 &&
    accountColumns.rows.every(
      (row) =>
        row.can_select === false &&
        row.can_insert === false &&
        row.can_update === false &&
        row.can_reference === false,
    );
  const [
    tenantPublicSafe,
    tenantPublicColumnsSafe,
    accountPublicSafe,
    accountPublicColumnsSafe,
    appendFunctionSafe,
  ] = await Promise.all([
    publicAccessDenied(client, "public.audit_events"),
    publicColumnAccessDenied(client, "public.audit_events"),
    publicAccessDenied(client, "public.account_security_audit_events"),
    publicColumnAccessDenied(client, "public.account_security_audit_events"),
    verifyAppendFunction(
      client,
      runtimeRole,
      accountSecurityRuntimeAppendFunction,
      true,
    ),
  ]);
  const controlledFunctionSafe = await verifyAppendFunction(
    client,
    runtimeRole,
    accountSecurityControlledAppendFunction,
    false,
  );
  if (
    !tenantSafe ||
    !tenantColumnsSafe ||
    !accountSafe ||
    !accountColumnsSafe ||
    !tenantPublicSafe ||
    !tenantPublicColumnsSafe ||
    !accountPublicSafe ||
    !accountPublicColumnsSafe ||
    !appendFunctionSafe ||
    !controlledFunctionSafe
  ) {
    throw new Error("Runtime audit foundation privileges are unsafe.");
  }
}

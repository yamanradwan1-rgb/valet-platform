// S04 cutover is DB-migration driven. Never regrant direct limiter writes.
export const runtimeFunctions = [
  "public.s04_counted(text,text,uuid,bigint,text)",
  "public.s04_reserve(text,text,uuid,bigint,text)",
  "public.s04_finalize(uuid,text,text,text,uuid,bigint,text)",
  "public.s04_guest_classified(text,text,text,integer,integer,integer,integer,integer,integer,integer,uuid,bigint,text)",
  "public.s04_cleanup_nonces()",
  "public.cleanup_expired_anti_abuse_events()",
];

export async function provisionS04RuntimePrivileges(
  client,
  executeFormatted,
  runtimeRole,
  migrationRole,
) {
  const ready = await client.query(
    "SELECT to_regclass('s04_quota_guard.proof_key') IS NOT NULL AS installed",
  );
  if (ready.rows[0]?.installed !== true) {
    throw new Error(
      "S04 protected quota migration is required before runtime provisioning.",
    );
  }
  const key = await client.query(
    "SELECT count(*)::integer AS count FROM s04_quota_guard.proof_key",
  );
  if (key.rows[0]?.count !== 1) {
    throw new Error(
      "S04 proof key is not provisioned. Protected quota must fail closed.",
    );
  }
  await client.query(
    "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.anti_abuse_events FROM PUBLIC",
  );
  await executeFormatted(
    client,
    "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.anti_abuse_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "REVOKE INSERT (scope,key_hash,state,request_class,group_key_hash) ON TABLE public.anti_abuse_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE (state,group_key_hash) ON TABLE public.anti_abuse_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT ON TABLE public.anti_abuse_events TO %I",
    [runtimeRole],
  );
  for (const signature of runtimeFunctions) {
    await client.query(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    await executeFormatted(
      client,
      `GRANT EXECUTE ON FUNCTION ${signature} TO %I`,
      [runtimeRole],
    );
  }
  await verifyS04RuntimePrivileges(client, runtimeRole, migrationRole);
}

export async function verifyS04RuntimePrivileges(
  client,
  runtimeRole,
  expectedOwner,
  options = {},
) {
  if (expectedOwner === undefined) {
    const identity = await client.query("SELECT session_user AS trusted_owner");
    expectedOwner = identity.rows[0]?.trusted_owner;
  }
  if (typeof expectedOwner !== "string" || expectedOwner.length === 0) {
    throw new Error(
      "S04 runtime verifier requires the trusted migration owner.",
    );
  }
  const denied = await client.query(
    `SELECT
      NOT has_any_column_privilege($1,'public.anti_abuse_events','INSERT') AS insert_denied,
      NOT has_any_column_privilege($1,'public.anti_abuse_events','UPDATE') AS update_denied,
      NOT has_table_privilege($1,'public.anti_abuse_events','DELETE') AS delete_denied,
      NOT has_table_privilege($1,'public.anti_abuse_events','TRUNCATE') AS truncate_denied,
      NOT has_table_privilege($1,'public.anti_abuse_events','TRIGGER') AS trigger_denied,
      NOT has_schema_privilege($1,'s04_quota_guard','USAGE') AS private_schema_denied`,
    [runtimeRole],
  );
  if (
    denied.rowCount !== 1 ||
    Object.values(denied.rows[0]).some((value) => value !== true)
  ) {
    throw new Error("S04 direct ordinary SQL quota mutation remains possible.");
  }
  for (const signature of runtimeFunctions) {
    const result = await client.query(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed,
         p.prosecdef AS definer,
         owner.rolname AS owner,
         owner.rolcanlogin AS owner_can_login,
         owner.rolinherit AS owner_inherit,
         owner.rolsuper AS owner_superuser,
         owner.rolcreatedb AS owner_create_db,
         owner.rolcreaterole AS owner_create_role,
         owner.rolreplication AS owner_replication,
         owner.rolbypassrls AS owner_bypass_rls,
         pg_catalog.has_database_privilege(owner.oid,pg_catalog.current_database(),'CREATE') AS owner_database_create,
         pg_catalog.has_schema_privilege(owner.oid,'public','CREATE') AS owner_public_create,
         p.proconfig @> ARRAY['search_path=pg_catalog']::text[] AS safe_search_path,
         p.proconfig @> ARRAY[
           'search_path=pg_catalog, public',
           'lock_timeout=200ms',
           'statement_timeout=500ms'
         ]::text[] AND cardinality(p.proconfig)=3 AS safe_legacy_cleanup,
         NOT EXISTS (
           SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
           WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
         ) AS public_denied
       FROM pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
       WHERE p.oid=to_regprocedure($2)`,
      [runtimeRole, signature],
    );
    const row = result.rows[0];
    const validPath =
      signature === "public.cleanup_expired_anti_abuse_events()"
        ? row?.safe_legacy_cleanup
        : row?.safe_search_path;
    const ownerAttributes = options.requireTrustedOwnerAttributes
      ? {
          // The migration owner is deliberately higher-trust and may have
          // CREATEDB/CREATEROLE plus database/schema DDL authority. Those
          // capabilities are not reachable by Runtime through these pinned
          // SECURITY DEFINER bodies, so constrain the execution-sensitive
          // role attributes here instead of pretending the migrator is inert.
          owner_can_login: true,
          owner_inherit: false,
          owner_superuser: false,
          owner_replication: false,
          owner_bypass_rls: false,
          ...options.expectedOwnerAttributes,
        }
      : (options.expectedOwnerAttributes ?? {});
    const ownerAttributesSafe = Object.entries(ownerAttributes).every(
      ([attribute, expected]) => row?.[attribute] === expected,
    );
    if (
      !row?.allowed ||
      !row.definer ||
      row.owner !== expectedOwner ||
      !validPath ||
      !row.public_denied ||
      !ownerAttributesSafe
    ) {
      throw new Error("S04 required narrow SQL definer is missing or unsafe.");
    }
  }
}

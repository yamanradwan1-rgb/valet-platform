import { verifyGuestBrowserPrivileges } from "./guest-browser-session-runtime-privileges.mjs";

// Keep DEC-064 verification and T3's exact ephemeral grants in one Guest boundary.
export async function verifyGuestRuntimePrivileges(client, runtimeRole) {
  await verifyGuestBrowserPrivileges(client, runtimeRole);
  const result = await client.query(
    `SELECT has_column_privilege($1,'public.anti_abuse_events','request_class','INSERT') AS class_insert,
       has_column_privilege($1,'public.anti_abuse_events','group_key_hash','INSERT') AS group_insert,
       has_column_privilege($1,'public.anti_abuse_events','group_key_hash','UPDATE') AS group_update,
       NOT has_column_privilege($1,'public.anti_abuse_events','key_hash','UPDATE') AS key_update_denied,
       NOT has_column_privilege($1,'public.anti_abuse_events','occurred_at','INSERT') AS time_insert_denied,
       NOT has_column_privilege($1,'public.anti_abuse_events','request_class','UPDATE') AS class_update_denied,
       NOT has_table_privilege($1,'public.anti_abuse_events','DELETE') AS delete_denied,
       NOT has_table_privilege($1,'public.anti_abuse_events','TRUNCATE') AS truncate_denied,
       has_function_privilege($1,p.oid,'EXECUTE') AS execute,
       p.prosecdef AND p.proowner <> r.oid AS owner_safe,
       p.proconfig @> ARRAY['search_path=pg_catalog, public','lock_timeout=200ms','statement_timeout=500ms']::text[]
         AND cardinality(p.proconfig)=3 AS config_safe,
       NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_denied
     FROM pg_proc p CROSS JOIN pg_roles r
     WHERE p.oid='public.cleanup_expired_anti_abuse_events()'::regprocedure AND r.rolname=$1`,
    [runtimeRole],
  );
  const row = result.rows[0];
  if (row === undefined || Object.values(row).some((value) => value !== true)) {
    throw new Error("Runtime Guest anti-abuse privileges are unsafe.");
  }
}

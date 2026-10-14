export const photoReadTables = [
  "public.condition_photo_upload_operations",
  "public.condition_photo_upload_attempts",
  "public.vehicle_photo_verifications",
  "public.vehicle_photo_availability",
];

export const photoPrivateTables = [
  ...photoReadTables,
  "public.condition_photo_upload_admission",
];

export const photoRuntimeFunctions = [
  "public.condition_photo_reserve_upload(uuid,uuid,uuid,uuid,bytea,integer,integer,text)",
  "public.condition_photo_claim_upload(uuid,uuid,uuid,boolean,text)",
  "public.condition_photo_mark_stored(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)",
  "public.condition_photo_record_failure(uuid,uuid,uuid,uuid,uuid,text)",
  "public.condition_photo_finalize_upload(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)",
  "public.condition_photo_set_availability(uuid,uuid,uuid,condition_photo_availability_state,text)",
];

export const photoMaintenanceFunctions = [
  "public.condition_photo_expire_operation(uuid)",
  "public.condition_photo_abandon_attempt(uuid)",
];

export async function listPhotoFunctions(client) {
  const result = await client.query(
    `SELECT function.oid::regprocedure::text AS signature,
            function.oid::text AS oid,
            function.prosecdef AS security_definer,
            function.proconfig = ARRAY['search_path=pg_catalog, public']::text[]
              AS search_path_safe,
            owner.rolname AS owner,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(
                COALESCE(function.proacl, acldefault('f', function.proowner))
              ) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
            ) AS public_denied,
            NOT EXISTS (
              SELECT 1 FROM aclexplode(
                COALESCE(function.proacl, acldefault('f', function.proowner))
              ) acl WHERE acl.privilege_type = 'EXECUTE' AND acl.is_grantable
            ) AS grant_option_denied
       FROM pg_proc function
       JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
       JOIN pg_roles owner ON owner.oid = function.proowner
      WHERE namespace.nspname = 'public'
        AND left(function.proname, length('condition_photo_')) = 'condition_photo_'`,
  );
  return result.rows;
}

export async function photoFunctionIds(client, signatures) {
  const result = await client.query(
    `SELECT signature, to_regprocedure(signature)::oid::text AS oid
       FROM unnest($1::text[]) AS signature`,
    [signatures],
  );
  const missing = result.rows.filter((row) => row.oid === null);
  if (missing.length > 0) {
    throw new Error("Condition-photo database functions are missing.");
  }
  return new Set(result.rows.map((row) => row.oid));
}

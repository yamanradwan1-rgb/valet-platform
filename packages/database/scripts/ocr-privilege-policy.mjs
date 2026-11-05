export const ocrTables = [
  "public.ocr_platform_control",
  "public.ocr_organization_control",
  "public.ocr_budget_periods",
  "public.ocr_organization_allocations",
  "public.ocr_attempts",
  "public.ocr_control_history",
];

export const ocrRuntimeFunctions = [
  "public.ocr_admit(uuid,uuid,uuid,integer)",
  "public.ocr_settle(uuid,uuid,uuid,uuid,uuid,text,uuid,bigint,text,text,text,text,integer)",
];

export const ocrMaintenanceFunctions = [
  "public.ocr_detect_expired(integer)",
];

export const ocrOperatorFunctions = [
  "public.ocr_operator_provision_period(uuid,text,timestamptz,timestamptz,bigint,text,text)",
  "public.ocr_operator_set_org(uuid,uuid,bigint,boolean,integer,text,text)",
  "public.ocr_operator_allocate(uuid,uuid,uuid,bigint,bigint,text,text)",
  "public.ocr_operator_set_platform(uuid,bigint,boolean,text,integer,text,text)",
  "public.ocr_operator_activate_period(uuid,bigint,uuid,text,text)",
  "public.ocr_operator_resolve_attempt(uuid,uuid,uuid,bigint,text,text,text)",
];

export const ocrPrivateFunctions = [
  "public.ocr_require_operator(text,text,boolean)",
  "public.ocr_budget_row_guard()",
  "public.ocr_attempt_row_guard()",
  "public.ocr_control_history_append_only()",
];

export const ocrAllFunctions = [
  ...ocrRuntimeFunctions,
  ...ocrMaintenanceFunctions,
  ...ocrOperatorFunctions,
  ...ocrPrivateFunctions,
];

export async function listOcrFunctions(client) {
  const { rows } = await client.query(`
    SELECT p.oid::text AS oid,p.oid::regprocedure::text AS signature,
           p.prosecdef AS security_definer,
           p.proconfig=ARRAY['search_path=pg_catalog, public']::text[]
             AS search_path_safe,
           owner.rolname AS owner,
           NOT EXISTS(
             SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
             WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) AS public_denied,
           NOT EXISTS(
             SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
             WHERE acl.privilege_type='EXECUTE' AND acl.is_grantable
           ) AS grant_option_denied
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_roles owner ON owner.oid=p.proowner
    WHERE n.nspname='public' AND left(p.proname,4)='ocr_'
  `);
  return rows;
}

export async function assertOcrFunctionCatalog(client) {
  const { rows } = await client.query(`
    SELECT f.signature,to_regprocedure(f.signature)::oid::text AS oid
    FROM unnest($1::text[]) AS f(signature)`, [ocrAllFunctions]);
  if (rows.some(({ oid }) => oid === null)) {
    throw new Error("OCR security function is missing.");
  }
  const catalog = await listOcrFunctions(client);
  if (catalog.length !== ocrAllFunctions.length) {
    throw new Error("Unknown OCR function requires explicit privilege review.");
  }
  return catalog;
}

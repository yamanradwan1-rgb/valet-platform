-- W7 P1: pre-existing API roles had table-wide INSERT, enabling unverified
-- providers to be self-attested during creation. Keep unverified onboarding.
-- Migration is forward-only: do not modify 086-089 or disrupt owner/DBA ACL.
REVOKE INSERT ON TABLE public.outbound_provider_bindings FROM PUBLIC;

-- Repair already-provisioned runtimes during upgrade (not only fresh setup).
-- Restrict explicit non-owner INSERT grantees to the same column whitelist as
-- outbound-runtime-privileges.mjs. Other tables/privileges are untouched.
DO $outbound_insert_acl$
DECLARE v_role record;
BEGIN
  FOR v_role IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid=acl.grantee
    WHERE c.oid='public.outbound_provider_bindings'::regclass
      AND acl.privilege_type='INSERT'
      AND acl.grantee<>0 AND acl.grantee<>c.relowner
  LOOP
    EXECUTE format('REVOKE INSERT ON TABLE public.outbound_provider_bindings FROM %I',v_role.rolname);
    EXECUTE format('GRANT INSERT (id,organization_id,purpose,provider,environment,waba_id,phone_number_id,config_alias) ON TABLE public.outbound_provider_bindings TO %I',v_role.rolname);
  END LOOP;
END
$outbound_insert_acl$;

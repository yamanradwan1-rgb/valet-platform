-- Issue #416 / Option A. Preserve v9 MFA app events before a coordinated
-- PROTECTED cutover; deny SQL-only forged USER MFA activity after cutover.
-- The reset and controlled-operator reservations remain unconditionally denied.
SET ROLE vap1_proof_owner;
DO $vap1$
DECLARE v_owner text;
BEGIN
  SELECT r.rolname INTO STRICT v_owner
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
  WHERE p.oid = 'public.append_runtime_account_security_audit_event(
    uuid,text,uuid,public.account_security_actor_type,uuid,timestamp with time zone
  )'::pg_catalog.regprocedure;
  EXECUTE pg_catalog.format(
    'GRANT SELECT ON auth_proof_private.security_boundary TO %I',
    v_owner
  );
  EXECUTE pg_catalog.format(
    'GRANT USAGE ON SCHEMA auth_proof_private TO %I',
    v_owner
  );
END;
$vap1$;
RESET ROLE;

CREATE OR REPLACE FUNCTION public.append_runtime_account_security_audit_event(
    p_id UUID,
    p_event_type TEXT,
    p_subject_user_id UUID,
    p_actor_type public.account_security_actor_type,
    p_actor_user_id UUID,
    p_occurred_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_event_type IN (
    'STAFF_PASSWORD_RESET_LINK_ISSUED',
    'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'
  ) THEN
    RAISE EXCEPTION 'Protected security audit boundary required'
      USING ERRCODE = '42501';
  END IF;
  IF p_actor_type = 'CONTROLLED_OPERATOR' THEN
    RAISE EXCEPTION 'Controlled operator audit boundary required'
      USING ERRCODE = '42501';
  END IF;
  IF p_event_type IN (
    'MFA_TOTP_ACTIVATED',
    'MFA_RECOVERY_CODE_USED',
    'MFA_FACTOR_REENROLLMENT_STARTED',
    'MFA_RECOVERY_CODES_REISSUED'
  ) AND EXISTS (
    SELECT 1 FROM auth_proof_private.security_boundary
    WHERE singleton AND phase = 'PROTECTED'
  ) THEN
    RAISE EXCEPTION 'Protected MFA audit boundary required'
      USING ERRCODE = '42501';
  END IF;
  RETURN public.append_account_security_audit_event(
    p_id, p_event_type, p_subject_user_id,
    p_actor_type, p_actor_user_id, NULL, p_occurred_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_runtime_account_security_audit_event(
    UUID, TEXT, UUID, public.account_security_actor_type, UUID, TIMESTAMPTZ
) FROM PUBLIC;

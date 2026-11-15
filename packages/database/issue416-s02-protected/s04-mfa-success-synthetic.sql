-- TEST-ONLY S02 fixture parity with W58 S04 scoped success. NOT a migration.
-- Future integrated Option C uses W58's separately reviewed migration instead.
CREATE FUNCTION public.s04_mfa_success(
  p_id uuid,p_scope text,p_key text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  IF p_scope NOT IN ('v1:mfa-totp-user','v1:mfa-recovery-user') THEN
    RAISE EXCEPTION 'S04_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  UPDATE public.anti_abuse_events SET state='IGNORED'
  WHERE id=p_id AND scope=p_scope AND key_hash=p_key AND state='PENDING';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.s04_mfa_success(uuid,text,text) FROM PUBLIC;

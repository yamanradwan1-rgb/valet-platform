-- Option C S02: narrowly signed same-transaction management idle touch.
-- No global VAP1 signer, generic MFA writer, or raw bearer secrets in SQL.
BEGIN;
CREATE SCHEMA mfa_activity_private;
REVOKE ALL ON SCHEMA mfa_activity_private FROM PUBLIC;

CREATE TABLE mfa_activity_private.key_root (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret bytea NOT NULL CHECK (pg_catalog.octet_length(secret)=32)
);
CREATE TABLE mfa_activity_private.consumed_nonce (
  nonce uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  backend_pid integer NOT NULL,
  full_xid text NOT NULL,
  issued_ms bigint NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA mfa_activity_private FROM PUBLIC;

CREATE FUNCTION mfa_activity_private.touch_admin_activity(
  p_session_id uuid,p_user_id uuid,p_access_hash text,p_nonce uuid,
  p_backend_pid integer,p_full_xid text,p_issued_ms bigint,p_mac bytea
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE v_root bytea;
v_expected bytea;
v_delta integer:=0;
v_index integer;
v_now timestamptz(3):=pg_catalog.clock_timestamp()::timestamptz(3);
v_now_ms bigint;
v_message text;
v_rows integer;
v_crypto_schema text;
BEGIN
  v_now_ms:=pg_catalog.trunc(EXTRACT(
    epoch FROM pg_catalog.clock_timestamp())*1000)::bigint;
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_nonce IS NULL
     OR p_access_hash IS NULL
     OR p_access_hash !~ '^staff-access-sha256:v1:[0-9a-f]{64}$'
     OR p_backend_pid IS NULL OR p_backend_pid<>pg_catalog.pg_backend_pid()
     OR p_full_xid IS NULL OR p_full_xid !~ '^[0-9]{1,20}$'
     OR p_full_xid<>pg_catalog.pg_current_xact_id()::text
     OR p_issued_ms IS NULL
     OR pg_catalog.abs(v_now_ms-p_issued_ms)>3000
     OR p_mac IS NULL OR pg_catalog.octet_length(p_mac)<>32 THEN
    RAISE EXCEPTION 'S02_ACTIVITY_PROOF_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT secret INTO v_root FROM mfa_activity_private.key_root
    WHERE singleton=true;
  IF NOT FOUND OR v_root IS NULL THEN
    RAISE EXCEPTION 'S02_ACTIVITY_KEY_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  v_message:='MFA_ADMIN_ACTIVITY/v1|'
    ||pg_catalog.current_database()||'|'||p_session_id::text
    ||'|'||p_user_id::text||'|'||p_access_hash
    ||'|'||p_nonce::text||'|'||p_backend_pid::text
    ||'|'||p_full_xid||'|'||p_issued_ms::text;
  SELECT namespace.nspname INTO v_crypto_schema
    FROM pg_catalog.pg_extension extension
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid=extension.extnamespace
    WHERE extension.extname='pgcrypto';
  IF v_crypto_schema IS NULL THEN
    RAISE EXCEPTION 'S02_ACTIVITY_CRYPTO_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  EXECUTE pg_catalog.format(
    'SELECT %I.hmac($1,$2,''sha256'')',v_crypto_schema)
    INTO v_expected
    USING pg_catalog.convert_to(v_message,'UTF8'),v_root;
  FOR v_index IN 0..31 LOOP
    v_delta:=v_delta | (pg_catalog.get_byte(v_expected,v_index)
      # pg_catalog.get_byte(p_mac,v_index));
  END LOOP;
  IF v_delta<>0 THEN
    RAISE EXCEPTION 'S02_ACTIVITY_PROOF_DENIED' USING ERRCODE='42501';
  END IF;
  BEGIN
    INSERT INTO mfa_activity_private.consumed_nonce(
      nonce,session_id,backend_pid,full_xid,issued_ms
    ) VALUES (p_nonce,p_session_id,p_backend_pid,p_full_xid,p_issued_ms);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'S02_ACTIVITY_REPLAY_DENIED' USING ERRCODE='42501';
  END;
  UPDATE public.staff_auth_sessions AS session
    SET last_admin_activity_at=v_now
    FROM public.users AS staff_user,
      public.user_mfa_totp_factors AS factor
    WHERE session.id=p_session_id AND session.user_id=p_user_id
      AND session.current_access_token_hash=p_access_hash
      AND session.revoked_at IS NULL
      AND staff_user.id=session.user_id AND staff_user.status='ACTIVE'
      AND factor.id=session.mfa_factor_id AND factor.user_id=session.user_id
      AND factor.state='ACTIVE'
      AND session.mfa_authenticated_at IS NOT NULL
      AND session.last_admin_activity_at IS NOT NULL
      AND v_now<session.access_expires_at
      AND v_now<session.absolute_expires_at
      AND v_now<session.mfa_authenticated_at+INTERVAL '8 hours'
      AND v_now<session.last_admin_activity_at+INTERVAL '30 minutes';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'S02_ACTIVITY_ASSURANCE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN 1;
END;
$$;
REVOKE ALL ON FUNCTION mfa_activity_private.touch_admin_activity(
  uuid,uuid,text,uuid,integer,text,bigint,bytea) FROM PUBLIC;
COMMIT;

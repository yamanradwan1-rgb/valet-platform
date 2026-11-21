SET ROLE vaylet_staff_session_lock_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION public.staff_auth_lock_current_session(
  p_session_id uuid,
  p_user_id uuid,
  p_access_token text,
  p_created_at timestamptz,
  p_lock_mode text
) RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  created_at timestamptz,
  absolute_expires_at timestamptz,
  mfa_authenticated_at timestamptz,
  mfa_factor_id uuid,
  last_admin_activity_at timestamptz,
  checked_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $staff_session_lock$
DECLARE
  v_session record;
  v_effective_session_id uuid;
  v_effective_user_id uuid;
  v_effective_created_at timestamptz;
  v_locked_user_id uuid;
  v_user_status text;
  v_now timestamptz;
  v_token_hash text;
BEGIN
  IF p_access_token IS NULL
     OR p_access_token !~ '^vsa1[.][A-Za-z0-9_-]{43}$'
     OR p_lock_mode IS NULL OR p_lock_mode NOT IN ('SHARED', 'EXCLUSIVE') THEN
    RETURN;
  END IF;
  IF (p_session_id IS NULL OR p_user_id IS NULL OR p_created_at IS NULL)
     AND NOT (p_session_id IS NULL AND p_user_id IS NULL AND p_created_at IS NULL) THEN
    RETURN;
  END IF;
  IF p_session_id IS NULL AND p_lock_mode <> 'SHARED' THEN
    RETURN;
  END IF;

  v_token_hash := 'staff-access-sha256:v1:' ||
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')),
      'hex'
    );

  IF p_session_id IS NULL THEN
    -- Initial request resolution derives the advisory-lock key from the bearer;
    -- Runtime never receives SELECT authority on the stored verifier column.
    SELECT session.id, session.user_id, session.created_at
      INTO v_effective_session_id, v_effective_user_id, v_effective_created_at
    FROM public.staff_auth_sessions AS session
    INNER JOIN public.users AS staff_user ON staff_user.id = session.user_id
    WHERE session.current_access_token_hash = v_token_hash
      AND session.revoked_at IS NULL
      AND pg_catalog.clock_timestamp() < session.access_expires_at
      AND pg_catalog.clock_timestamp() < session.absolute_expires_at
      AND staff_user.status = 'ACTIVE';
    IF NOT FOUND THEN RETURN; END IF;
  ELSE
    v_effective_session_id := p_session_id;
    v_effective_user_id := p_user_id;
    v_effective_created_at := p_created_at;
    -- Reject invalid credentials before taking an advisory lock for a supplied
    -- User ID. The locked checks below repeat every authority predicate.
    PERFORM 1
    FROM public.staff_auth_sessions AS session
    INNER JOIN public.users AS staff_user ON staff_user.id = session.user_id
    WHERE session.id = v_effective_session_id
      AND session.user_id = v_effective_user_id
      AND session.created_at = v_effective_created_at
      AND session.current_access_token_hash = v_token_hash
      AND session.revoked_at IS NULL
      AND pg_catalog.clock_timestamp() < session.access_expires_at
      AND pg_catalog.clock_timestamp() < session.absolute_expires_at
      AND staff_user.status = 'ACTIVE';
    IF NOT FOUND THEN RETURN; END IF;
  END IF;

  IF p_lock_mode = 'SHARED' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended(
        'staff-user-security:' || v_effective_user_id::text, 0
      )
    );
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'staff-user-security:' || v_effective_user_id::text, 0
      )
    );
  END IF;

  -- Canonical row order is User then Staff session. The inert lock-version
  -- grants exist solely so this owner can take the row locks without mutation.
  IF p_lock_mode = 'SHARED' THEN
    SELECT staff_user.id, staff_user.status::text
      INTO v_locked_user_id, v_user_status
    FROM public.users AS staff_user
    WHERE staff_user.id = v_effective_user_id
    FOR SHARE;
  ELSE
    SELECT staff_user.id, staff_user.status::text
      INTO v_locked_user_id, v_user_status
    FROM public.users AS staff_user
    WHERE staff_user.id = v_effective_user_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_lock_mode = 'SHARED' THEN
    SELECT session.id, session.user_id, session.created_at,
           session.current_access_token_hash, session.revoked_at,
           session.access_expires_at, session.absolute_expires_at,
           session.mfa_authenticated_at, session.mfa_factor_id,
           session.last_admin_activity_at
      INTO v_session
    FROM public.staff_auth_sessions AS session
    WHERE session.id = v_effective_session_id
      AND session.user_id = v_effective_user_id
      AND session.created_at = v_effective_created_at
      AND session.current_access_token_hash = v_token_hash
      AND session.revoked_at IS NULL
      AND pg_catalog.clock_timestamp() < session.access_expires_at
      AND pg_catalog.clock_timestamp() < session.absolute_expires_at
    FOR SHARE;
  ELSE
    SELECT session.id, session.user_id, session.created_at,
           session.current_access_token_hash, session.revoked_at,
           session.access_expires_at, session.absolute_expires_at,
           session.mfa_authenticated_at, session.mfa_factor_id,
           session.last_admin_activity_at
      INTO v_session
    FROM public.staff_auth_sessions AS session
    WHERE session.id = v_effective_session_id
      AND session.user_id = v_effective_user_id
      AND session.created_at = v_effective_created_at
      AND session.current_access_token_hash = v_token_hash
      AND session.revoked_at IS NULL
      AND pg_catalog.clock_timestamp() < session.access_expires_at
      AND pg_catalog.clock_timestamp() < session.absolute_expires_at
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_locked_user_id <> v_effective_user_id
     OR v_user_status <> 'ACTIVE'
     OR v_session.revoked_at IS NOT NULL
     OR v_session.current_access_token_hash <> v_token_hash
     OR v_session.id <> v_effective_session_id
     OR v_session.user_id <> v_effective_user_id
     OR v_session.created_at <> v_effective_created_at
     OR v_now >= v_session.access_expires_at
     OR v_now >= v_session.absolute_expires_at THEN
    RETURN;
  END IF;

  session_id := v_session.id;
  user_id := v_session.user_id;
  created_at := v_session.created_at;
  absolute_expires_at := v_session.absolute_expires_at;
  mfa_authenticated_at := v_session.mfa_authenticated_at;
  mfa_factor_id := v_session.mfa_factor_id;
  last_admin_activity_at := v_session.last_admin_activity_at;
  checked_at := v_now;
  RETURN NEXT;
END;
$staff_session_lock$;

REVOKE ALL ON FUNCTION public.staff_auth_lock_current_session(
  uuid, uuid, text, timestamptz, text
) FROM PUBLIC;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM vaylet_staff_session_lock_owner;

-- Preserve the deployed ABI while changing the TEXT proof input from a stored
-- verifier to the raw bearer. The definer derives the verifier internally.
CREATE OR REPLACE FUNCTION mfa_activity_private.touch_admin_activity(
  p_session_id uuid,p_user_id uuid,p_access_hash text,p_nonce uuid,
  p_backend_pid integer,p_full_xid text,p_issued_ms bigint,p_mac bytea
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $mfa_activity$
DECLARE v_root bytea; v_expected bytea; v_delta integer:=0; v_index integer;
  v_now timestamptz(3):=pg_catalog.clock_timestamp()::timestamptz(3);
  v_now_ms bigint; v_message text; v_rows integer; v_crypto_schema text;
  v_access_hash text;
BEGIN
  v_now_ms:=pg_catalog.trunc(EXTRACT(
    epoch FROM pg_catalog.clock_timestamp())*1000)::bigint;
  IF p_session_id IS NULL OR p_user_id IS NULL OR p_nonce IS NULL
     OR p_access_hash IS NULL OR p_access_hash !~ '^vsa1[.][A-Za-z0-9_-]{43}$'
     OR p_backend_pid IS NULL OR p_backend_pid<>pg_catalog.pg_backend_pid()
     OR p_full_xid IS NULL OR p_full_xid !~ '^[0-9]{1,20}$'
     OR p_full_xid<>pg_catalog.pg_current_xact_id()::text
     OR p_issued_ms IS NULL OR pg_catalog.abs(v_now_ms-p_issued_ms)>3000
     OR p_mac IS NULL OR pg_catalog.octet_length(p_mac)<>32 THEN
    RAISE EXCEPTION 'S02_ACTIVITY_PROOF_DENIED' USING ERRCODE='42501';
  END IF;
  v_access_hash:='staff-access-sha256:v1:'||pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_access_hash,'UTF8')),'hex');
  SELECT secret INTO v_root FROM mfa_activity_private.key_root WHERE singleton=true;
  IF NOT FOUND OR v_root IS NULL THEN
    RAISE EXCEPTION 'S02_ACTIVITY_KEY_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  v_message:='MFA_ADMIN_ACTIVITY/v1|'||pg_catalog.current_database()||'|'
    ||p_session_id::text||'|'||p_user_id::text||'|'||p_access_hash||'|'
    ||p_nonce::text||'|'||p_backend_pid::text||'|'||p_full_xid||'|'||p_issued_ms::text;
  SELECT namespace.nspname INTO v_crypto_schema
    FROM pg_catalog.pg_extension extension
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=extension.extnamespace
    WHERE extension.extname='pgcrypto';
  IF v_crypto_schema IS NULL THEN
    RAISE EXCEPTION 'S02_ACTIVITY_CRYPTO_UNAVAILABLE' USING ERRCODE='42501';
  END IF;
  EXECUTE pg_catalog.format('SELECT %I.hmac($1,$2,''sha256'')',v_crypto_schema)
    INTO v_expected USING pg_catalog.convert_to(v_message,'UTF8'),v_root;
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
  UPDATE public.staff_auth_sessions AS session SET last_admin_activity_at=v_now
    FROM public.users AS staff_user, public.user_mfa_totp_factors AS factor
    WHERE session.id=p_session_id AND session.user_id=p_user_id
      AND session.current_access_token_hash=v_access_hash
      AND session.revoked_at IS NULL
      AND staff_user.id=session.user_id AND staff_user.status='ACTIVE'
      AND factor.id=session.mfa_factor_id AND factor.user_id=session.user_id
      AND factor.state='ACTIVE' AND session.mfa_authenticated_at IS NOT NULL
      AND session.last_admin_activity_at IS NOT NULL
      AND v_now<session.access_expires_at AND v_now<session.absolute_expires_at
      AND v_now<session.mfa_authenticated_at+INTERVAL '8 hours'
      AND v_now<session.last_admin_activity_at+INTERVAL '30 minutes';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'S02_ACTIVITY_ASSURANCE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN 1;
END;
$mfa_activity$;
REVOKE ALL ON FUNCTION mfa_activity_private.touch_admin_activity(
  uuid,uuid,text,uuid,integer,text,bigint,bytea) FROM PUBLIC;

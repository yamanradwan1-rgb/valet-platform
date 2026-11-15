-- A01 purpose-locked prepare and separate committed limiter lease.
-- Runtime grants remain absent until trusted signer, ACL and concurrency review.
BEGIN;
GRANT SELECT(id,email,password_hash,status),
  UPDATE(last_login_at,updated_at) ON public.users TO vap1_proof_owner;
GRANT SELECT,INSERT ON public.staff_auth_sessions TO vap1_proof_owner;
GRANT SELECT,INSERT ON public.staff_refresh_credentials TO vap1_proof_owner;
GRANT SELECT(id,scope,key_hash,state,occurred_at),UPDATE(state)
  ON public.anti_abuse_events TO vap1_proof_owner;
SET ROLE vap1_proof_owner;

-- Call in a READ COMMITTED lease after the existing secret-backed anti-abuse
-- service reserves the exact identifier, and COMMIT before password verification.
-- SQL digest/UUID readback alone never proves the HTTP sender's identity.
CREATE FUNCTION auth_proof_private.a01_bind_limiter(
  p_audience text,p_operation_id uuid,p_reservation_id uuid,
  p_request_fingerprint bytea,p_identifier_hash text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE e record;
v_count bigint;
v_now timestamptz(6);
v_hex text;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    OR p_audience IS NULL
    OR p_audience !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
    OR p_operation_id IS NULL OR p_reservation_id IS NULL
    OR pg_catalog.octet_length(p_request_fingerprint) <> 32
    OR p_identifier_hash IS NULL OR p_identifier_hash !~
      '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  -- Same advisory lock pair as AntiAbuseKey's HMAC prefix.
  v_hex := pg_catalog.split_part(p_identifier_hash,':',3);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    ('x' || pg_catalog.substr(v_hex,1,8))::bit(32)::integer,
    ('x' || pg_catalog.substr(v_hex,9,8))::bit(32)::integer);
  SELECT scope,key_hash,state,occurred_at INTO e
    FROM public.anti_abuse_events WHERE id = p_reservation_id FOR UPDATE;
  v_now := pg_catalog.clock_timestamp();
  IF NOT FOUND OR e.scope <> 'v1:staff-login-identifier'
    OR e.key_hash IS DISTINCT FROM p_identifier_hash
    OR e.state <> 'PENDING' OR e.occurred_at > v_now
    OR e.occurred_at <= v_now - INTERVAL '15 minutes' THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT pg_catalog.count(*) INTO v_count
    FROM public.anti_abuse_events a
    WHERE a.scope = e.scope AND a.key_hash = e.key_hash
      AND a.state IN ('PENDING','COUNTED')
      AND a.occurred_at > v_now - INTERVAL '15 minutes'
      AND a.occurred_at <= v_now;
  IF v_count NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_EXHAUSTED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO auth_proof_private.limiter_bindings(
    reservation_id,audience,operation_id,purpose,scope,key_digest,
    request_fingerprint
  ) VALUES (
    p_reservation_id,p_audience,p_operation_id,
    'STAFF_LOGIN_COMMIT',e.scope,
    pg_catalog.decode(v_hex,'hex'),p_request_fingerprint);
  RETURN p_reservation_id;
END;
$$;

-- Generates the EXACT canonical kind-01/kind-03 bytes used in both phases.
-- The SQL user/limiter/admission records and selected key are row-locked here.
CREATE FUNCTION auth_proof_private.a01_locked_frames(
  p_audience text,p_operation_id uuid,p_user_id uuid,
  p_verified_phc_digest bytea,p_session_id uuid,p_refresh_id uuid,
  p_access_hash text,p_refresh_hash text,p_reservation_id uuid,
  p_request_fingerprint bytea
) RETURNS TABLE(payload_bytes bytea,state_bytes bytea)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_row bytea;
v_groups bytea[] := ARRAY[]::bytea[];
v_group integer;
v_epoch bigint;
BEGIN
  IF p_operation_id IS NULL OR p_user_id IS NULL
    OR pg_catalog.octet_length(p_request_fingerprint) <> 32 THEN
    RAISE EXCEPTION 'VAP1_A01_LOCKED_STATE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_audience || ':' || p_operation_id::text,41601));
  IF EXISTS (SELECT 1 FROM auth_proof_private.operation_receipts r
    WHERE r.audience = p_audience AND r.operation_id = p_operation_id) THEN
    RAISE EXCEPTION 'VAP1_A01_OPERATION_ALREADY_USED' USING ERRCODE = '23505';
  END IF;
  -- Rank 03 global User X lock: freezes password/status and prevents
  -- stale Argon2 verification from being promoted to an authenticated session.
  PERFORM 1 FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  PERFORM auth_proof_private.assert_a01_password_version(
    p_user_id,p_verified_phc_digest);
  v_row := auth_proof_private.user_state_row_v1(p_user_id);
  payload_bytes := auth_proof_private.a01_payload_v1(
    p_operation_id,p_user_id,p_verified_phc_digest,p_session_id,p_refresh_id,
    p_access_hash,p_refresh_hash,p_reservation_id);
  FOR v_group IN 5..20 LOOP
    v_groups := pg_catalog.array_append(v_groups,
      CASE v_group
        WHEN 5 THEN auth_proof_private.a01_admission_group(
          p_audience,p_user_id,pg_catalog.substring(
            v_row,pg_catalog.octet_length(v_row)-31,32))
        WHEN 6 THEN auth_proof_private.user_state_group_v1(p_user_id)
        WHEN 19 THEN auth_proof_private.a01_limiter_group(
          p_audience,p_operation_id,p_reservation_id,p_request_fingerprint)
        ELSE auth_proof_private.empty_state_group(v_group)
      END);
  END LOOP;
  -- Rank 15 key lock retained until transaction end.
  SELECT s.promotion_epoch INTO v_epoch
    FROM auth_proof_private.key_selection s
    JOIN auth_proof_private.proof_keys k ON k.audience=s.audience
      AND k.key_id=s.key_id
    WHERE s.audience=p_audience AND k.disposition='ACTIVE_SIGNING'
      AND k.promotion_epoch=s.promotion_epoch FOR SHARE OF s,k;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_A01_KEY_DENIED' USING ERRCODE = '42501';
  END IF;
  state_bytes := auth_proof_private.state_frame_v1(
    p_operation_id,'STAFF_LOGIN_COMMIT',v_epoch,v_groups);
  RETURN NEXT;
END;
$$;

CREATE FUNCTION auth_proof_private.a01_prepare(
  p_audience text,p_operation_id uuid,p_user_id uuid,
  p_verified_phc_digest bytea,p_session_id uuid,p_refresh_id uuid,
  p_access_hash text,p_refresh_hash text,p_reservation_id uuid,
  p_request_fingerprint bytea
) RETURNS TABLE(
  challenge_id uuid,proof_bytes bytea,payload_bytes bytea,state_bytes bytea,
  key_id text,key_promotion_epoch bigint,issued_at_ms bigint,
  expires_at_ms bigint,backend_pid integer,full_xid numeric
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE c record;
v_epoch bigint;
BEGIN
  SELECT f.payload_bytes,f.state_bytes INTO payload_bytes,state_bytes
    FROM auth_proof_private.a01_locked_frames(
      p_audience,p_operation_id,p_user_id,p_verified_phc_digest,
      p_session_id,p_refresh_id,p_access_hash,p_refresh_hash,
      p_reservation_id,p_request_fingerprint) f;
  SELECT * INTO c FROM auth_proof_private.open_challenge(
    p_audience,'STAFF_LOGIN_COMMIT',p_operation_id,'ANONYMOUS',
    NULL,NULL,NULL,NULL,p_user_id,
    pg_catalog.sha256(payload_bytes),pg_catalog.sha256(state_bytes));
  SELECT s.promotion_epoch INTO v_epoch
    FROM auth_proof_private.key_selection s
    WHERE s.audience=p_audience;
  IF c.key_promotion_epoch IS DISTINCT FROM v_epoch THEN
    RAISE EXCEPTION 'VAP1_A01_KEY_DENIED' USING ERRCODE = '42501';
  END IF;
  challenge_id:=c.challenge_id;proof_bytes:=c.proof_bytes;
  key_id:=c.key_id;key_promotion_epoch:=c.key_promotion_epoch;
  issued_at_ms:=c.issued_at_ms;expires_at_ms:=c.expires_at_ms;
  backend_pid:=c.backend_pid;full_xid:=c.full_xid;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.a01_bind_limiter(
  text,uuid,uuid,bytea,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_locked_frames(
  text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_prepare(
  text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea) FROM PUBLIC;
RESET ROLE;
COMMIT;

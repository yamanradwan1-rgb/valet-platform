-- A01 one-use HMAC verification, original User/version recheck, session and
-- refresh creation, limiter discount and receipt in one PostgreSQL transaction.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.a01_execute(
  p_challenge_id uuid,p_proof_bytes bytea,p_mac bytea,
  p_audience text,p_operation_id uuid,p_user_id uuid,
  p_verified_phc_digest bytea,p_session_id uuid,p_refresh_id uuid,
  p_access_hash text,p_refresh_hash text,p_reservation_id uuid,
  p_request_fingerprint bytea
) RETURNS TABLE(
  committed_session_id uuid,access_expires_at timestamptz,
  absolute_expires_at timestamptz,receipt_operation_id uuid
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE c auth_proof_private.proof_challenges%ROWTYPE;
v_payload bytea;
v_state bytea;
v_now timestamptz(3);
v_rows integer;
BEGIN
  SELECT * INTO c FROM auth_proof_private.proof_challenges x
    WHERE x.challenge_id=p_challenge_id;
  IF NOT FOUND OR c.audience IS DISTINCT FROM p_audience
    OR c.purpose <> 'STAFF_LOGIN_COMMIT'
    OR c.operation_id IS DISTINCT FROM p_operation_id
    OR c.actor_kind <> 'ANONYMOUS'
    OR c.actor_user_id IS NOT NULL OR c.actor_session_id IS NOT NULL
    OR c.organization_id IS NOT NULL OR c.membership_id IS NOT NULL
    OR c.subject_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE = '42501';
  END IF;
  -- Rebuild BOTH frames from live locked state, including the private
  -- committed pre-domain reservation. Never accept caller-claimed state.
  SELECT f.payload_bytes,f.state_bytes INTO v_payload,v_state
    FROM auth_proof_private.a01_locked_frames(
      p_audience,p_operation_id,p_user_id,p_verified_phc_digest,
      p_session_id,p_refresh_id,p_access_hash,p_refresh_hash,
      p_reservation_id,p_request_fingerprint) f;
  IF pg_catalog.sha256(v_payload) IS DISTINCT FROM c.payload_digest
    OR pg_catalog.sha256(v_state) IS DISTINCT FROM c.state_digest THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM auth_proof_private.consume_verified_challenge(
    p_challenge_id,p_proof_bytes,p_mac,c.payload_digest,c.state_digest);
  v_now := pg_catalog.clock_timestamp()::timestamptz(3);
  INSERT INTO public.staff_auth_sessions(
    id,user_id,current_access_token_hash,access_expires_at,
    absolute_expires_at,created_at,last_rotated_at
  ) VALUES (
    p_session_id,p_user_id,p_access_hash,v_now+INTERVAL '15 minutes',
    v_now+INTERVAL '720 hours',v_now,v_now
  );
  INSERT INTO public.staff_refresh_credentials(
    id,session_id,token_hash,generation,created_at,expires_at
  ) VALUES (
    p_refresh_id,p_session_id,p_refresh_hash,1,v_now,
    v_now+INTERVAL '720 hours'
  );
  UPDATE public.users u
    SET last_login_at=v_now,updated_at=v_now
    WHERE u.id=p_user_id AND u.status='ACTIVE'
      AND pg_catalog.sha256(pg_catalog.convert_to(
        u.password_hash,'UTF8'))=p_verified_phc_digest;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anti_abuse_events e
    SET state='IGNORED'
    WHERE e.id=p_reservation_id AND e.state='PENDING'
      AND e.scope='v1:staff-login-identifier';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  receipt_operation_id:=auth_proof_private.commit_receipt(
    p_challenge_id,'COMPLETED',NULL);
  committed_session_id:=p_session_id;
  access_expires_at:=v_now+INTERVAL '15 minutes';
  absolute_expires_at:=v_now+INTERVAL '720 hours';
  RETURN NEXT;
END;
$$;

-- A failed/UNKNOWN operation must never be caller-discounted to IGNORED.
-- This conservative finalizer only counts an uncompleted PENDING attempt.
CREATE FUNCTION auth_proof_private.a01_count_unresolved(
  p_audience text,p_operation_id uuid,p_reservation_id uuid
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE e record;
DECLARE v_receipt uuid;
BEGIN
  SELECT b.reservation_id,b.purpose,b.scope,a.state
  INTO e FROM auth_proof_private.limiter_bindings b
  JOIN public.anti_abuse_events a ON a.id=b.reservation_id
  WHERE b.audience=p_audience AND b.operation_id=p_operation_id
    AND b.reservation_id=p_reservation_id FOR UPDATE OF a;
  IF NOT FOUND OR e.purpose <> 'STAFF_LOGIN_COMMIT'
    OR e.scope <> 'v1:staff-login-identifier' THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT r.operation_id INTO v_receipt
    FROM auth_proof_private.operation_receipts r
    WHERE r.audience=p_audience AND r.operation_id=p_operation_id
      AND r.purpose='STAFF_LOGIN_COMMIT' AND r.outcome='COMPLETED';
  IF FOUND THEN
    IF e.state <> 'IGNORED' THEN
      RAISE EXCEPTION 'VAP1_A01_RECEIPT_STATE_MISMATCH'
        USING ERRCODE = '42501';
    END IF;
    RETURN 'IGNORED';
  END IF;
  IF e.state='COUNTED' THEN RETURN 'COUNTED'; END IF;
  IF e.state <> 'PENDING' THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anti_abuse_events SET state='COUNTED'
    WHERE id=p_reservation_id AND state='PENDING';
  RETURN 'COUNTED';
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.a01_execute(
  uuid,bytea,bytea,text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_count_unresolved(
  text,uuid,uuid) FROM PUBLIC;
RESET ROLE;
COMMIT;

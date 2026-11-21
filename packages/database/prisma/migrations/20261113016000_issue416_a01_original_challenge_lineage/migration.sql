-- A01 forward-only original signed-payload lineage. Earlier commits lacked
-- this private evidence. Those receipts remain UNKNOWN, never reconstructed.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE TABLE auth_proof_private.a01_original_lineage (
  challenge_id uuid PRIMARY KEY
    REFERENCES auth_proof_private.proof_challenges(challenge_id),
  audience text NOT NULL,
  operation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  verified_phc_digest bytea NOT NULL
    CHECK (pg_catalog.octet_length(verified_phc_digest)=32),
  session_id uuid NOT NULL UNIQUE,
  refresh_id uuid NOT NULL UNIQUE,
  access_hash text NOT NULL
    CHECK (access_hash ~ '^staff-access-sha256:v1:[0-9a-f]{64}$'),
  refresh_hash text NOT NULL
    CHECK (refresh_hash ~ '^staff-refresh-sha256:v1:[0-9a-f]{64}$'),
  reservation_id uuid NOT NULL UNIQUE,
  created_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (audience,operation_id),
  FOREIGN KEY (audience,operation_id)
    REFERENCES auth_proof_private.operation_receipts(audience,operation_id)
);

CREATE FUNCTION auth_proof_private.guard_a01_original_lineage()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE c auth_proof_private.proof_challenges%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' OR current_user <> 'vap1_proof_owner' THEN
    RAISE EXCEPTION 'VAP1_A01_LINEAGE_IMMUTABLE' USING ERRCODE='42501';
  END IF;
  SELECT * INTO c FROM auth_proof_private.proof_challenges
    WHERE challenge_id=NEW.challenge_id FOR SHARE;
  IF NOT FOUND OR c.purpose<>'STAFF_LOGIN_COMMIT'
    OR c.consumed_at IS NULL
    OR c.backend_pid<>pg_catalog.pg_backend_pid()
    OR c.full_xid<>pg_catalog.pg_current_xact_id()::text::numeric
    OR c.audience IS DISTINCT FROM NEW.audience
    OR c.operation_id IS DISTINCT FROM NEW.operation_id
    OR c.subject_user_id IS DISTINCT FROM NEW.user_id
    OR c.payload_digest IS DISTINCT FROM pg_catalog.sha256(
      auth_proof_private.a01_payload_v1(
        NEW.operation_id,NEW.user_id,NEW.verified_phc_digest,
        NEW.session_id,NEW.refresh_id,NEW.access_hash,NEW.refresh_hash,
        NEW.reservation_id))
    OR NOT EXISTS (
      SELECT 1 FROM auth_proof_private.operation_receipts r
      WHERE r.challenge_id=c.challenge_id
        AND r.audience=c.audience AND r.operation_id=c.operation_id
        AND r.purpose=c.purpose AND r.outcome='COMPLETED'
        AND r.payload_digest=c.payload_digest
        AND r.state_digest=c.state_digest
        AND r.audit_event_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'VAP1_A01_LINEAGE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue416_a01_original_lineage_immutable
  BEFORE INSERT OR UPDATE OR DELETE
  ON auth_proof_private.a01_original_lineage
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.guard_a01_original_lineage();

CREATE OR REPLACE FUNCTION auth_proof_private.a01_execute(
  p_challenge_id uuid,p_proof_bytes bytea,p_mac bytea,
  p_audience text,p_operation_id uuid,p_user_id uuid,
  p_verified_phc_digest bytea,p_session_id uuid,p_refresh_id uuid,
  p_access_hash text,p_refresh_hash text,p_reservation_id uuid,
  p_request_fingerprint bytea
) RETURNS TABLE(
  committed_session_id uuid,access_expires_at timestamptz,
  absolute_expires_at timestamptz,receipt_operation_id uuid
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $$
DECLARE c auth_proof_private.proof_challenges%ROWTYPE;
v_payload bytea;
v_state bytea;
v_now timestamptz(3);
v_rows integer;
v_audit_id uuid;
BEGIN
  SELECT * INTO c FROM auth_proof_private.proof_challenges x
    WHERE x.challenge_id=p_challenge_id;
  IF NOT FOUND OR c.audience IS DISTINCT FROM p_audience
    OR c.purpose<>'STAFF_LOGIN_COMMIT'
    OR c.operation_id IS DISTINCT FROM p_operation_id
    OR c.actor_kind<>'ANONYMOUS'
    OR c.actor_user_id IS NOT NULL OR c.actor_session_id IS NOT NULL
    OR c.organization_id IS NOT NULL OR c.membership_id IS NOT NULL
    OR c.subject_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT f.payload_bytes,f.state_bytes INTO v_payload,v_state
    FROM auth_proof_private.a01_locked_frames(
      p_audience,p_operation_id,p_user_id,p_verified_phc_digest,
      p_session_id,p_refresh_id,p_access_hash,p_refresh_hash,
      p_reservation_id,p_request_fingerprint) f;
  IF pg_catalog.sha256(v_payload) IS DISTINCT FROM c.payload_digest
    OR pg_catalog.sha256(v_state) IS DISTINCT FROM c.state_digest THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE='42501';
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
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE='42501';
  END IF;
  UPDATE public.anti_abuse_events e
    SET state='IGNORED'
    WHERE e.id=p_reservation_id AND e.state='PENDING'
      AND e.scope='v1:staff-login-identifier';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE='42501';
  END IF;
  v_audit_id:=pg_catalog.gen_random_uuid();
  INSERT INTO public.account_security_audit_events(
    id,event_type,subject_user_id,actor_type,actor_user_id,occurred_at
  ) VALUES (
    v_audit_id,'STAFF_LOGIN_SESSION_CREATED',p_user_id,'USER',
    p_user_id,v_now
  );
  receipt_operation_id:=auth_proof_private.commit_receipt(
    p_challenge_id,'COMPLETED',v_audit_id);
  INSERT INTO auth_proof_private.a01_original_lineage (
    challenge_id,audience,operation_id,user_id,verified_phc_digest,
    session_id,refresh_id,access_hash,refresh_hash,reservation_id
  ) VALUES (
    p_challenge_id,p_audience,p_operation_id,p_user_id,p_verified_phc_digest,
    p_session_id,p_refresh_id,p_access_hash,p_refresh_hash,p_reservation_id
  );
  committed_session_id:=p_session_id;
  access_expires_at:=v_now+INTERVAL '15 minutes';
  absolute_expires_at:=v_now+INTERVAL '720 hours';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON TABLE auth_proof_private.a01_original_lineage FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.guard_a01_original_lineage()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_execute(
  uuid,bytea,bytea,text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea)
  FROM PUBLIC;
RESET ROLE;
COMMIT;

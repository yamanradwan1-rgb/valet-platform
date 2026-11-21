-- A01 forward-only repair: audit provenance must commit with the login.
-- Earlier source-only migration 140 wrote a NULL audit; it never had runtime
-- EXECUTE permission. This migration supersedes it before any activation.
BEGIN;
GRANT INSERT(id,event_type,subject_user_id,actor_type,actor_user_id,occurred_at),
  TRIGGER ON public.account_security_audit_events TO vap1_proof_owner;
SET ROLE vap1_proof_owner;

-- The generic public audit writer must not mint the reserved A01 event.
-- This trigger is INVOKER: current_user remains the actual SQL writer role.
CREATE FUNCTION auth_proof_private.guard_a01_audit_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.event_type <> 'STAFF_LOGIN_SESSION_CREATED'
    THEN RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
    AND current_user = 'vap1_proof_owner'
    AND NEW.actor_type = 'USER'::public.account_security_actor_type
    AND NEW.actor_user_id IS NOT NULL
    AND NEW.actor_user_id = NEW.subject_user_id
    AND NEW.controlled_operator_ref IS NULL
    AND EXISTS (
      SELECT 1 FROM auth_proof_private.proof_challenges c
      WHERE c.purpose='STAFF_LOGIN_COMMIT'
        AND c.subject_user_id=NEW.subject_user_id
        AND c.actor_kind='ANONYMOUS'
        AND c.consumed_at IS NOT NULL
        AND c.backend_pid=pg_catalog.pg_backend_pid()
        AND c.full_xid=pg_catalog.pg_current_xact_id()::text::numeric
    ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.event_type <> 'STAFF_LOGIN_SESSION_CREATED'
    AND NEW.event_type <> 'STAFF_LOGIN_SESSION_CREATED' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND OLD.event_type <> 'STAFF_LOGIN_SESSION_CREATED' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'VAP1_A01_AUDIT_IMMUTABLE_OR_UNBOUND'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER issue416_a01_audit_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.account_security_audit_events
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.guard_a01_audit_mutation();

-- Defer the receipt-to-audit match to COMMIT. In the transaction that inserts
-- the event, commit_receipt occurs immediately AFTER the audit INSERT.
CREATE FUNCTION auth_proof_private.assert_a01_audit_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth_proof_private.operation_receipts r
    JOIN auth_proof_private.proof_challenges c
      ON c.challenge_id=r.challenge_id
    WHERE r.audit_event_id=NEW.id
      AND r.purpose='STAFF_LOGIN_COMMIT' AND r.outcome='COMPLETED'
      AND r.audience=c.audience AND r.operation_id=c.operation_id
      AND r.purpose=c.purpose
      AND r.payload_digest=c.payload_digest
      AND r.state_digest=c.state_digest
      AND c.actor_kind='ANONYMOUS'
      AND c.actor_user_id IS NULL AND c.actor_session_id IS NULL
      AND c.organization_id IS NULL AND c.membership_id IS NULL
      AND c.subject_user_id=NEW.subject_user_id
      AND c.consumed_at IS NOT NULL
      AND NEW.actor_type='USER'::public.account_security_actor_type
      AND NEW.actor_user_id=NEW.subject_user_id
  ) THEN
    RAISE EXCEPTION 'VAP1_A01_AUDIT_RECEIPT_MISSING'
      USING ERRCODE='42501';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER issue416_a01_audit_receipt_complete
  AFTER INSERT ON public.account_security_audit_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.event_type = 'STAFF_LOGIN_SESSION_CREATED')
  EXECUTE FUNCTION auth_proof_private.assert_a01_audit_receipt();

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
SET search_path = pg_catalog AS $$
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
    OR c.purpose <> 'STAFF_LOGIN_COMMIT'
    OR c.operation_id IS DISTINCT FROM p_operation_id
    OR c.actor_kind <> 'ANONYMOUS'
    OR c.actor_user_id IS NOT NULL OR c.actor_session_id IS NOT NULL
    OR c.organization_id IS NOT NULL OR c.membership_id IS NOT NULL
    OR c.subject_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'VAP1_A01_EXECUTE_DENIED' USING ERRCODE = '42501';
  END IF;
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
  -- The original actor type is USER because the trusted A01 signer has
  -- witnessed the submitted password. Subject and actor IDs are the same
  -- globally scoped User; no organization membership is invented for login.
  v_audit_id := pg_catalog.gen_random_uuid();
  INSERT INTO public.account_security_audit_events(
    id,event_type,subject_user_id,actor_type,actor_user_id,occurred_at
  ) VALUES (
    v_audit_id,'STAFF_LOGIN_SESSION_CREATED',p_user_id,'USER',
    p_user_id,v_now
  );
  receipt_operation_id:=auth_proof_private.commit_receipt(
    p_challenge_id,'COMPLETED',v_audit_id);
  committed_session_id:=p_session_id;
  access_expires_at:=v_now+INTERVAL '15 minutes';
  absolute_expires_at:=v_now+INTERVAL '720 hours';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.guard_a01_audit_mutation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_a01_audit_receipt()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_execute(
  uuid,bytea,bytea,text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea)
  FROM PUBLIC;
RESET ROLE;
COMMIT;

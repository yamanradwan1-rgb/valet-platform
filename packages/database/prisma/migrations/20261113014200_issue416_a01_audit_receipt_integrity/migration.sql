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

-- UNKNOWN/COMMITTED is safe receipt provenance only, never proof that a
-- bearer is still redeemable. Require live unrevoked original lineage and
-- one immutable original audit; no caller-provided success flag.
CREATE OR REPLACE FUNCTION auth_proof_private.a01_read_commit_receipt(
  p_audience text,p_operation_id uuid,p_user_id uuid,
  p_session_id uuid,p_refresh_id uuid,p_reservation_id uuid,
  p_access_hash text,p_refresh_hash text
) RETURNS TABLE(
  receipt_status text,access_expires_at timestamptz,
  absolute_expires_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_session record;
BEGIN
  receipt_status := 'UNKNOWN';
  access_expires_at := NULL;
  absolute_expires_at := NULL;
  IF p_audience IS NULL OR p_audience !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
    OR p_operation_id IS NULL OR p_user_id IS NULL
    OR p_session_id IS NULL OR p_refresh_id IS NULL
    OR p_reservation_id IS NULL OR p_access_hash IS NULL
    OR p_access_hash !~ '^staff-access-sha256:v1:[0-9a-f]{64}$'
    OR p_refresh_hash IS NULL
    OR p_refresh_hash !~ '^staff-refresh-sha256:v1:[0-9a-f]{64}$'
    OR NOT EXISTS (SELECT 1 FROM auth_proof_private.security_boundary b
      WHERE b.singleton AND b.phase='PROTECTED'
        AND b.deployment_audience=p_audience) THEN
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT ss.access_expires_at,ss.absolute_expires_at INTO v_session
    FROM auth_proof_private.operation_receipts r
    JOIN auth_proof_private.proof_challenges c
      ON c.challenge_id=r.challenge_id
    JOIN public.account_security_audit_events a
      ON a.id=r.audit_event_id
    JOIN auth_proof_private.limiter_bindings b
      ON b.audience=r.audience AND b.operation_id=r.operation_id
    JOIN public.anti_abuse_events e ON e.id=b.reservation_id
    JOIN public.users u ON u.id=p_user_id AND u.status='ACTIVE'
    JOIN public.staff_auth_sessions ss
      ON ss.id=p_session_id AND ss.user_id=u.id
    JOIN public.staff_refresh_credentials f
      ON f.id=p_refresh_id AND f.session_id=ss.id
    WHERE r.audience=p_audience AND r.operation_id=p_operation_id
      AND r.purpose='STAFF_LOGIN_COMMIT' AND r.outcome='COMPLETED'
      AND r.payload_digest=c.payload_digest AND r.state_digest=c.state_digest
      AND c.audience=r.audience AND c.operation_id=r.operation_id
      AND c.purpose=r.purpose AND c.actor_kind='ANONYMOUS'
      AND c.actor_user_id IS NULL AND c.actor_session_id IS NULL
      AND c.organization_id IS NULL AND c.membership_id IS NULL
      AND c.subject_user_id=u.id AND c.consumed_at IS NOT NULL
      AND a.event_type='STAFF_LOGIN_SESSION_CREATED'
      AND a.actor_type='USER'::public.account_security_actor_type
      AND a.subject_user_id=u.id AND a.actor_user_id=u.id
      AND a.controlled_operator_ref IS NULL
      AND b.reservation_id=p_reservation_id
      AND b.purpose=r.purpose AND b.scope='v1:staff-login-identifier'
      AND b.bound_full_xid IS NOT NULL
      AND b.bound_full_xid<>c.full_xid
      AND b.request_fingerprint IS NOT NULL
      AND e.scope=b.scope AND e.state='IGNORED'
      AND b.key_digest=pg_catalog.decode(
        pg_catalog.split_part(e.key_hash,':',3),'hex')
      AND ss.current_access_token_hash=p_access_hash
      AND ss.revoked_at IS NULL
      AND ss.created_at=a.occurred_at
      AND ss.access_expires_at=a.occurred_at+INTERVAL '15 minutes'
      AND ss.absolute_expires_at=a.occurred_at+INTERVAL '720 hours'
      AND ss.access_expires_at>pg_catalog.clock_timestamp()
      AND f.token_hash=p_refresh_hash AND f.generation=1
      AND f.consumed_at IS NULL AND f.replaced_by_credential_id IS NULL
      AND f.created_at=a.occurred_at
      AND f.expires_at=a.occurred_at+INTERVAL '720 hours'
      AND f.expires_at>pg_catalog.clock_timestamp();
  IF FOUND THEN
    receipt_status := 'COMMITTED';
    access_expires_at := v_session.access_expires_at;
    absolute_expires_at := v_session.absolute_expires_at;
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION auth_proof_private.a01_count_unresolved(
  p_audience text,p_operation_id uuid,p_reservation_id uuid
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE e record;
v_receipt uuid;
BEGIN
  SELECT b.reservation_id,b.purpose,b.scope,a.state
    INTO e FROM auth_proof_private.limiter_bindings b
    JOIN public.anti_abuse_events a ON a.id=b.reservation_id
    WHERE b.audience=p_audience AND b.operation_id=p_operation_id
      AND b.reservation_id=p_reservation_id FOR UPDATE OF a;
  IF NOT FOUND OR e.purpose <> 'STAFF_LOGIN_COMMIT'
    OR e.scope <> 'v1:staff-login-identifier' THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE='42501';
  END IF;
  -- A successful authenticated commit MUST have its original event; a bare
  -- receipt or caller-controlled UUID cannot erase counted limiter history.
  SELECT r.operation_id INTO v_receipt
    FROM auth_proof_private.operation_receipts r
    JOIN auth_proof_private.proof_challenges c ON c.challenge_id=r.challenge_id
    JOIN public.account_security_audit_events a ON a.id=r.audit_event_id
    WHERE r.audience=p_audience AND r.operation_id=p_operation_id
      AND r.purpose='STAFF_LOGIN_COMMIT' AND r.outcome='COMPLETED'
      AND c.audience=r.audience AND c.operation_id=r.operation_id
      AND c.purpose=r.purpose AND c.consumed_at IS NOT NULL
      AND a.event_type='STAFF_LOGIN_SESSION_CREATED'
      AND a.actor_type='USER'::public.account_security_actor_type
      AND a.subject_user_id=c.subject_user_id
      AND a.actor_user_id=c.subject_user_id;
  IF FOUND THEN
    IF e.state <> 'IGNORED' THEN
      RAISE EXCEPTION 'VAP1_A01_RECEIPT_STATE_MISMATCH'
        USING ERRCODE='42501';
    END IF;
    RETURN 'IGNORED';
  END IF;
  IF e.state='COUNTED' THEN RETURN 'COUNTED'; END IF;
  IF e.state <> 'PENDING' THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE='42501';
  END IF;
  UPDATE public.anti_abuse_events SET state='COUNTED'
    WHERE id=p_reservation_id AND state='PENDING';
  RETURN 'COUNTED';
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.guard_a01_audit_mutation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_a01_audit_receipt()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_execute(
  uuid,bytea,bytea,text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_read_commit_receipt(
  text,uuid,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_count_unresolved(
  text,uuid,uuid) FROM PUBLIC;
RESET ROLE;
COMMIT;

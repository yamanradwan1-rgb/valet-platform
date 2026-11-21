-- Issue416 A01: purpose-bound original audit/receipt state observation.
-- Completes the forward-only source migration 142 before protected activation.
BEGIN;
SET ROLE vap1_proof_owner;

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
REVOKE ALL ON FUNCTION auth_proof_private.a01_read_commit_receipt(
  text,uuid,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_count_unresolved(
  text,uuid,uuid) FROM PUBLIC;
RESET ROLE;
COMMIT;

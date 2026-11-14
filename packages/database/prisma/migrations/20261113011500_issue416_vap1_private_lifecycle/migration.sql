-- Issue #416: private one-transaction challenge/verification primitives.
-- Callable ONLY from a distinct purpose-specific, audited SQL SECURITY DEFINER
-- command owned by vap1_proof_owner after independently locked admission.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.open_challenge(
  p_audience text,
  p_purpose text,
  p_operation_id uuid,
  p_actor_kind text,
  p_actor_user_id uuid,
  p_actor_session_id uuid,
  p_organization_id uuid,
  p_membership_id uuid,
  p_subject_user_id uuid,
  p_payload_digest bytea,
  p_state_digest bytea
) RETURNS TABLE (
  challenge_id uuid, proof_bytes bytea, key_id text,
  key_promotion_epoch bigint, issued_at_ms bigint, expires_at_ms bigint,
  backend_pid integer, full_xid numeric
) LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE
  v_key_id text;
  v_epoch bigint;
  v_now_ms bigint;
  v_nonce bytea;
  v_full_xid numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth_proof_private.security_boundary
    WHERE singleton AND phase = 'PROTECTED'
  ) THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_purpose IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM auth_proof_private.proof_purposes
       WHERE purpose = p_purpose AND actor_kind = p_actor_kind
         AND wire_schema_version = 1 AND enabled
     )
     OR p_actor_kind NOT IN ('STAFF','ANONYMOUS','OPERATOR')
     OR p_audience IS NULL OR p_audience !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
     OR p_payload_digest IS NULL OR pg_catalog.octet_length(p_payload_digest) <> 32
     OR p_state_digest IS NULL OR pg_catalog.octet_length(p_state_digest) <> 32
     OR (p_actor_kind = 'STAFF' AND
       (p_actor_user_id IS NULL OR p_actor_session_id IS NULL))
     OR (p_actor_kind IN ('ANONYMOUS','OPERATOR')
       AND (p_actor_user_id IS NOT NULL OR p_actor_session_id IS NOT NULL))
  THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Domain/admission locks 01..14 MUST already be held by the narrow writer.
  -- Rank 15: lock key selection AND its selected key for the full transaction.
  SELECT s.key_id, s.promotion_epoch INTO v_key_id, v_epoch
  FROM auth_proof_private.key_selection s
  JOIN auth_proof_private.proof_keys k
    ON k.audience = s.audience AND k.key_id = s.key_id
  WHERE s.audience = p_audience AND k.disposition = 'ACTIVE_SIGNING'
    AND k.promotion_epoch = s.promotion_epoch
  FOR SHARE OF s,k;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;

  v_nonce := auth_proof_private.pgcrypto_random32();
  v_full_xid := pg_catalog.pg_current_xact_id()::text::numeric;
  v_now_ms := pg_catalog.trunc(
    pg_catalog.extract('epoch', pg_catalog.clock_timestamp()) * 1000
  )::bigint;
  INSERT INTO auth_proof_private.proof_challenges (
    challenge_id, audience, key_id, promotion_epoch, purpose, operation_id,
    nonce, backend_pid, full_xid, actor_kind, actor_user_id, actor_session_id,
    organization_id, membership_id, subject_user_id,
    payload_digest, state_digest, issued_at_ms, expires_at_ms
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_audience, v_key_id, v_epoch,
    p_purpose, p_operation_id, v_nonce, pg_catalog.pg_backend_pid(), v_full_xid,
    p_actor_kind, p_actor_user_id, p_actor_session_id,
    p_organization_id, p_membership_id, p_subject_user_id,
    p_payload_digest, p_state_digest, v_now_ms, v_now_ms + 30000
  ) RETURNING proof_challenges.challenge_id
    INTO challenge_id;

  proof_bytes := auth_proof_private.proof_bytes(challenge_id);
  key_id := v_key_id;
  key_promotion_epoch := v_epoch;
  issued_at_ms := v_now_ms;
  expires_at_ms := v_now_ms + 30000;
  backend_pid := pg_catalog.pg_backend_pid();
  full_xid := v_full_xid;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION auth_proof_private.consume_verified_challenge(
  p_challenge_id uuid,
  p_proof_bytes bytea,
  p_mac bytea,
  p_locked_payload_digest bytea,
  p_locked_state_digest bytea
) RETURNS uuid LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE
  v_preflight auth_proof_private.proof_challenges%ROWTYPE;
  v_locked auth_proof_private.proof_challenges%ROWTYPE;
  v_key bytea;
  v_digest_key_id text;
  v_epoch bigint;
  v_expected bytea;
  v_work integer := 0;
  v_index integer;
  v_now_ms bigint;
BEGIN
  IF p_challenge_id IS NULL OR p_proof_bytes IS NULL
     OR p_mac IS NULL OR pg_catalog.octet_length(p_mac) <> 32
     OR p_locked_payload_digest IS NULL
     OR pg_catalog.octet_length(p_locked_payload_digest) <> 32
     OR p_locked_state_digest IS NULL
     OR pg_catalog.octet_length(p_locked_state_digest) <> 32 THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth_proof_private.security_boundary
    WHERE singleton AND phase = 'PROTECTED'
  ) THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Discovery is NOT admission. Retain the previously selected key lock at
  -- rank 15 before acquiring the one-use challenge lock at rank 16.
  SELECT * INTO v_preflight FROM auth_proof_private.proof_challenges
  WHERE challenge_id = p_challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT s.key_id, s.promotion_epoch, k.root_key
    INTO v_digest_key_id, v_epoch, v_key
  FROM auth_proof_private.key_selection s
  JOIN auth_proof_private.proof_keys k
    ON k.audience = s.audience AND k.key_id = s.key_id
  WHERE s.audience = v_preflight.audience
    AND k.disposition = 'ACTIVE_SIGNING'
    AND k.promotion_epoch = s.promotion_epoch
  FOR SHARE OF s,k;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_locked FROM auth_proof_private.proof_challenges
  WHERE challenge_id = p_challenge_id FOR UPDATE;
  v_now_ms := pg_catalog.trunc(
    pg_catalog.extract('epoch', pg_catalog.clock_timestamp()) * 1000
  )::bigint;
  IF v_locked.consumed_at IS NOT NULL
     OR v_locked.audience IS DISTINCT FROM v_preflight.audience
     OR v_locked.key_id IS DISTINCT FROM v_digest_key_id
     OR v_locked.promotion_epoch IS DISTINCT FROM v_epoch
     OR v_locked.backend_pid <> pg_catalog.pg_backend_pid()
     OR v_locked.full_xid <> pg_catalog.pg_current_xact_id()::text::numeric
     OR v_now_ms < v_locked.issued_at_ms
     OR v_now_ms >= v_locked.expires_at_ms
     OR v_locked.payload_digest <> p_locked_payload_digest
     OR v_locked.state_digest <> p_locked_state_digest
     OR p_proof_bytes <> auth_proof_private.proof_bytes(p_challenge_id)
  THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;

  v_expected := auth_proof_private.pgcrypto_hmac(p_proof_bytes, v_key);
  -- Exactly 32 iterations for 32-byte operands. This is bounded fixed work,
  -- NOT a claim of hardware/PLpgSQL constant-time execution.
  FOR v_index IN 0..31 LOOP
    v_work := v_work | (
      pg_catalog.get_byte(v_expected, v_index)
      # pg_catalog.get_byte(p_mac, v_index)
    );
  END LOOP;
  IF v_work <> 0 THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE auth_proof_private.proof_challenges
  SET consumed_at = pg_catalog.clock_timestamp()
  WHERE challenge_id = p_challenge_id AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN p_challenge_id;
END;
$$;

CREATE FUNCTION auth_proof_private.commit_receipt(
  p_challenge_id uuid, p_outcome text, p_audit_event_id uuid
) RETURNS uuid LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE v_challenge auth_proof_private.proof_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_challenge
  FROM auth_proof_private.proof_challenges
  WHERE challenge_id = p_challenge_id FOR UPDATE;
  IF NOT FOUND OR v_challenge.consumed_at IS NULL
     OR v_challenge.backend_pid <> pg_catalog.pg_backend_pid()
     OR v_challenge.full_xid <> pg_catalog.pg_current_xact_id()::text::numeric
     OR p_outcome NOT IN ('COMPLETED','REVOKED','LINK_UNAVAILABLE') THEN
    RAISE EXCEPTION 'VAP1_PROOF_DENIED' USING ERRCODE = '42501';
  END IF;
  INSERT INTO auth_proof_private.operation_receipts (
    audience, operation_id, purpose, payload_digest, state_digest,
    challenge_id, outcome, audit_event_id
  ) VALUES (
    v_challenge.audience, v_challenge.operation_id, v_challenge.purpose,
    v_challenge.payload_digest, v_challenge.state_digest,
    p_challenge_id, p_outcome, p_audit_event_id
  );
  RETURN v_challenge.operation_id;
END;
$$;

CREATE FUNCTION auth_proof_private.deny_receipt_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'VAP1_RECEIPT_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER vap1_receipt_immutable
  BEFORE UPDATE OR DELETE ON auth_proof_private.operation_receipts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.deny_receipt_change();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_proof_private FROM PUBLIC;
RESET ROLE;
COMMIT;

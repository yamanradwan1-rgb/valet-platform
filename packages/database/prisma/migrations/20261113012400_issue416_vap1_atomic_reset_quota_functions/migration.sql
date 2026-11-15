-- Issue416 R02 migration124: private reserve and receipt-derived reconciliation.
-- Migration120 supplies private tables and the authenticated evidence guard.
BEGIN;
SET ROLE vap1_proof_owner;
-- Called only on a completed, separate pre-domain lease. No domain locks held.
-- The fixed array order of returned reservation_ids is U2 source order:
-- target, issuer, organization, trusted client-address. No bearer/IP stored.
CREATE FUNCTION auth_proof_private.reserve_reset_issue_quota(
  p_audience text, p_operation_id uuid, p_request_fingerprint bytea,
  p_issuer_user_id uuid, p_issuer_membership_id uuid,
  p_target_user_id uuid, p_target_membership_id uuid, p_organization_id uuid,
  p_target_hash text, p_issuer_hash text, p_organization_hash text,
  p_client_address_hash text
) RETURNS TABLE (bundle_state text, reservation_ids uuid[])
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $$
DECLARE
  v_existing auth_proof_private.reset_issue_quota_bundles%ROWTYPE;
  v_key record;
  v_hex text;
  v_count bigint;
  v_now timestamptz(6);
BEGIN
  IF p_audience IS NULL
    OR p_audience !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
    OR p_operation_id IS NULL
    OR p_request_fingerprint IS NULL
    OR pg_catalog.octet_length(p_request_fingerprint) <> 32
    OR p_issuer_user_id IS NULL OR p_issuer_membership_id IS NULL
    OR p_target_user_id IS NULL OR p_target_membership_id IS NULL
    OR p_organization_id IS NULL
    OR p_target_hash IS NULL OR p_issuer_hash IS NULL
    OR p_organization_hash IS NULL OR p_client_address_hash IS NULL
    OR p_target_hash !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    OR p_issuer_hash !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    OR p_organization_hash !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    OR p_client_address_hash !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Serialize same-op retries (including different-key conflicts) first.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_audience || ':' || p_operation_id::text, 41602)
  );
  SELECT * INTO v_existing
  FROM auth_proof_private.reset_issue_quota_bundles b
  WHERE b.audience = p_audience AND b.operation_id = p_operation_id
  FOR UPDATE;
  IF FOUND THEN
    IF ROW(v_existing.request_fingerprint,v_existing.issuer_user_id,
      v_existing.issuer_membership_id,v_existing.target_user_id,
      v_existing.target_membership_id,v_existing.organization_id,
      v_existing.target_hash,v_existing.issuer_hash,
      v_existing.organization_hash,v_existing.client_address_hash)
    IS DISTINCT FROM ROW(p_request_fingerprint,p_issuer_user_id,
      p_issuer_membership_id,p_target_user_id,p_target_membership_id,
      p_organization_id,p_target_hash,p_issuer_hash,
      p_organization_hash,p_client_address_hash) THEN
      RAISE EXCEPTION 'VAP1_RESET_QUOTA_OPERATION_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    SELECT pg_catalog.array_agg(e.reservation_id ORDER BY
      CASE e.scope
        WHEN 'v1:staff-password-reset-issue-target-user' THEN 1
        WHEN 'v1:staff-password-reset-issue-issuer-user' THEN 2
        WHEN 'v1:staff-password-reset-issue-organization' THEN 3
        ELSE 4 END), pg_catalog.count(*)
    INTO reservation_ids,v_count
    FROM auth_proof_private.reset_issue_quota_entries e
    WHERE e.audience = p_audience AND e.operation_id = p_operation_id;
    IF v_count <> 4 THEN
      RAISE EXCEPTION 'VAP1_RESET_QUOTA_INCOMPLETE' USING ERRCODE = '23514';
    END IF;
    bundle_state := v_existing.state;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Logical scope + fixed HMAC key sorting; never sort derived lock integers.
  -- The first 8 digest bytes exactly match Node AntiAbuseKey.lockHigh/lockLow.
  FOR v_key IN
    SELECT s.scope, s.key_hash, s.cap
    FROM (VALUES
      ('v1:staff-password-reset-issue-target-user', p_target_hash, 3),
      ('v1:staff-password-reset-issue-issuer-user', p_issuer_hash, 20),
      ('v1:staff-password-reset-issue-organization', p_organization_hash, 100),
      ('v1:staff-password-reset-issue-client-address', p_client_address_hash, 30)
    ) AS s(scope,key_hash,cap)
    ORDER BY s.scope COLLATE "C", s.key_hash COLLATE "C"
  LOOP
    v_hex := pg_catalog.split_part(v_key.key_hash, ':', 3);
    PERFORM pg_catalog.pg_advisory_xact_lock(
      ('x' || pg_catalog.substr(v_hex,1,8))::bit(32)::integer,
      ('x' || pg_catalog.substr(v_hex,9,8))::bit(32)::integer
    );
    -- All checks and inserts use the same DB decision timestamp, after locks.
  END LOOP;
  v_now := pg_catalog.clock_timestamp();
  FOR v_key IN
    SELECT s.scope,s.key_hash,s.cap
    FROM (VALUES
      ('v1:staff-password-reset-issue-target-user', p_target_hash, 3),
      ('v1:staff-password-reset-issue-issuer-user', p_issuer_hash, 20),
      ('v1:staff-password-reset-issue-organization', p_organization_hash, 100),
      ('v1:staff-password-reset-issue-client-address', p_client_address_hash, 30)
    ) AS s(scope,key_hash,cap)
    ORDER BY s.scope COLLATE "C", s.key_hash COLLATE "C"
  LOOP
    SELECT pg_catalog.count(*) INTO v_count
    FROM auth_proof_private.reset_issue_quota_entries e
    WHERE e.scope = v_key.scope AND e.key_hash = v_key.key_hash
      AND e.state IN ('PENDING','COUNTED')
      AND e.occurred_at > v_now - INTERVAL '15 minutes'
      AND e.occurred_at <= v_now;
    IF v_count >= v_key.cap THEN
      RAISE EXCEPTION 'VAP1_RESET_QUOTA_EXHAUSTED'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO auth_proof_private.reset_issue_quota_bundles (
    audience,operation_id,request_fingerprint,issuer_user_id,
    issuer_membership_id,target_user_id,target_membership_id,organization_id,
    target_hash,issuer_hash,organization_hash,client_address_hash,reserved_at
  ) VALUES (
    p_audience,p_operation_id,p_request_fingerprint,p_issuer_user_id,
    p_issuer_membership_id,p_target_user_id,p_target_membership_id,
    p_organization_id,p_target_hash,p_issuer_hash,
    p_organization_hash,p_client_address_hash,v_now
  );
  INSERT INTO auth_proof_private.reset_issue_quota_entries (
    audience,operation_id,scope,key_hash,occurred_at
  ) VALUES
    (p_audience,p_operation_id,'v1:staff-password-reset-issue-target-user',p_target_hash,v_now),
    (p_audience,p_operation_id,'v1:staff-password-reset-issue-issuer-user',p_issuer_hash,v_now),
    (p_audience,p_operation_id,'v1:staff-password-reset-issue-organization',p_organization_hash,v_now),
    (p_audience,p_operation_id,'v1:staff-password-reset-issue-client-address',p_client_address_hash,v_now);
  SELECT pg_catalog.array_agg(e.reservation_id ORDER BY
    CASE e.scope
      WHEN 'v1:staff-password-reset-issue-target-user' THEN 1
      WHEN 'v1:staff-password-reset-issue-issuer-user' THEN 2
      WHEN 'v1:staff-password-reset-issue-organization' THEN 3
      ELSE 4 END)
  INTO reservation_ids
  FROM auth_proof_private.reset_issue_quota_entries e
  WHERE e.audience = p_audience AND e.operation_id = p_operation_id;
  bundle_state := 'PENDING';
  RETURN NEXT;
END;
$$;

-- Fresh lease after domain locks are released. Unknown COMMIT with no
-- independently committed domain evidence stays PENDING; after 900 seconds
-- its attempt is conservatively COUNTED, never caller-discounted.
CREATE FUNCTION auth_proof_private.reconcile_reset_issue_quota(
  p_audience text, p_operation_id uuid
) RETURNS text LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE
  v_bundle auth_proof_private.reset_issue_quota_bundles%ROWTYPE;
  v_evidence auth_proof_private.reset_issue_domain_evidence%ROWTYPE;
  v_target text;
  v_basis text;
  v_rows integer;
BEGIN
  SELECT * INTO v_bundle
  FROM auth_proof_private.reset_issue_quota_bundles b
  WHERE b.audience = p_audience AND b.operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'ABSENT';
  END IF;
  IF v_bundle.state <> 'PENDING' THEN
    RETURN v_bundle.state;
  END IF;
  SELECT * INTO v_evidence
  FROM auth_proof_private.reset_issue_domain_evidence e
  WHERE e.audience = p_audience AND e.operation_id = p_operation_id;
  IF FOUND THEN
    -- Revalidate surviving proof/audit source rather than trusting caller flags.
    IF NOT EXISTS (
      SELECT 1 FROM auth_proof_private.operation_receipts r
      JOIN auth_proof_private.proof_challenges c
        ON c.challenge_id = r.challenge_id
      WHERE r.audience = p_audience AND r.operation_id = p_operation_id
        AND r.purpose = 'RESET_ISSUE'
        AND r.challenge_id = v_evidence.challenge_id
        AND c.consumed_at IS NOT NULL AND c.actor_kind = 'STAFF'
        AND c.actor_user_id = v_bundle.issuer_user_id
        AND c.membership_id = v_bundle.issuer_membership_id
        AND c.organization_id = v_bundle.organization_id
        AND c.subject_user_id = v_bundle.target_user_id
        AND ((v_evidence.outcome = 'CHANGED' AND r.outcome = 'COMPLETED'
          AND r.audit_event_id = v_evidence.audit_event_id)
          OR (v_evidence.outcome = 'UNCHANGED'
            AND r.outcome = 'LINK_UNAVAILABLE' AND r.audit_event_id IS NULL))
    ) OR (v_evidence.outcome = 'CHANGED' AND NOT EXISTS (
      SELECT 1 FROM public.account_security_audit_events a
      WHERE a.id = v_evidence.audit_event_id
        AND a.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'
        AND a.actor_type = 'USER'
        AND a.actor_user_id = v_bundle.issuer_user_id
        AND a.subject_user_id = v_bundle.target_user_id
    )) THEN
      RAISE EXCEPTION 'VAP1_RESET_DOMAIN_EVIDENCE_DENIED'
        USING ERRCODE = '42501';
    END IF;
    v_target := CASE WHEN v_evidence.outcome = 'CHANGED'
      THEN 'COUNTED' ELSE 'IGNORED' END;
    v_basis := CASE WHEN v_evidence.outcome = 'CHANGED'
      THEN 'DOMAIN_CHANGED' ELSE 'DOMAIN_UNCHANGED' END;
  ELSIF pg_catalog.clock_timestamp() >= v_bundle.reserved_at + INTERVAL '15 minutes' THEN
    v_target := 'COUNTED';
    v_basis := 'EXPIRED_UNRESOLVED';
  ELSE
    RETURN 'PENDING';
  END IF;
  UPDATE auth_proof_private.reset_issue_quota_entries e
    SET state = v_target
    WHERE e.audience = p_audience AND e.operation_id = p_operation_id
      AND e.state = 'PENDING';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  UPDATE auth_proof_private.reset_issue_quota_bundles b
    SET state = v_target, finalized_at = pg_catalog.clock_timestamp(),
      finalization_basis = v_basis
    WHERE b.audience = p_audience AND b.operation_id = p_operation_id
      AND b.state = 'PENDING';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.reserve_reset_issue_quota(
  text,uuid,bytea,uuid,uuid,uuid,uuid,uuid,text,text,text,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.reconcile_reset_issue_quota(text,uuid)
  FROM PUBLIC;
RESET ROLE;
COMMIT;

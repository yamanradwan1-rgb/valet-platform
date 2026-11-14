-- Issue416 R02: COMMIT-derived four-scope terminalization, not caller opinion.
-- Migration120 already enforces one bundle / exactly four matching private
-- entries. Migration124's invoker-only finalizer is NOT a runtime grant.
BEGIN;
SET ROLE vap1_proof_owner;

-- Installing a stronger terminal rule must not silently bless historical
-- COUNTED/IGNORED rows that have never passed it. Fence writers before scan.
LOCK TABLE auth_proof_private.reset_issue_quota_bundles IN SHARE ROW EXCLUSIVE MODE;
DO $issue416_prior_terminal$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth_proof_private.reset_issue_quota_bundles
    WHERE state <> 'PENDING'
  ) THEN
    RAISE EXCEPTION 'VAP1_RESET_TERMINAL_PREEXISTING_UNVERIFIED'
      USING ERRCODE = '42501';
  END IF;
END;
$issue416_prior_terminal$;

CREATE FUNCTION auth_proof_private.assert_reset_quota_terminal_receipt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  b auth_proof_private.reset_issue_quota_bundles%ROWTYPE;
  e auth_proof_private.reset_issue_domain_evidence%ROWTYPE;
BEGIN
  -- Always read current committed-intent row at the deferred boundary; the
  -- trigger's NEW snapshot could predate other writes in this transaction.
  SELECT * INTO b FROM auth_proof_private.reset_issue_quota_bundles x
  WHERE x.audience = NEW.audience AND x.operation_id = NEW.operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_RESET_TERMINAL_RECEIPT_DENIED'
      USING ERRCODE = '42501';
  END IF;
  IF b.state = 'PENDING' THEN
    RETURN NULL;
  END IF;
  IF b.finalized_at IS NULL OR b.finalized_at < b.reserved_at
    OR b.finalized_at > pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'VAP1_RESET_TERMINAL_RECEIPT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  -- Unknown domain COMMIT cannot discount. Once the 900-second bound passes,
  -- COUNTED is the only conservative state without an authenticated receipt.
  IF b.finalization_basis = 'EXPIRED_UNRESOLVED' THEN
    IF NOT (b.state = 'COUNTED'
      AND b.finalized_at >= b.reserved_at + INTERVAL '15 minutes'
      AND pg_catalog.clock_timestamp() >= b.reserved_at + INTERVAL '15 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM auth_proof_private.reset_issue_domain_evidence x
        WHERE x.audience = b.audience AND x.operation_id = b.operation_id
      )) THEN
      RAISE EXCEPTION 'VAP1_RESET_TERMINAL_RECEIPT_DENIED'
        USING ERRCODE = '42501';
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO e FROM auth_proof_private.reset_issue_domain_evidence x
  WHERE x.audience = b.audience AND x.operation_id = b.operation_id;
  IF NOT FOUND OR e.request_fingerprint IS DISTINCT FROM b.request_fingerprint
    OR NOT EXISTS (
      SELECT 1 FROM auth_proof_private.operation_receipts r
      JOIN auth_proof_private.proof_challenges c
        ON c.challenge_id = r.challenge_id
      WHERE r.audience = b.audience AND r.operation_id = b.operation_id
        AND r.purpose = 'RESET_ISSUE' AND r.challenge_id = e.challenge_id
        AND r.payload_digest = c.payload_digest
        AND r.state_digest = c.state_digest
        AND c.audience = r.audience AND c.operation_id = r.operation_id
        AND c.purpose = r.purpose AND c.consumed_at IS NOT NULL
        AND c.actor_kind = 'STAFF'
        AND c.actor_user_id = b.issuer_user_id
        AND c.actor_session_id IS NOT NULL
        AND c.membership_id = b.issuer_membership_id
        AND c.organization_id = b.organization_id
        AND c.subject_user_id = b.target_user_id
        AND (
          (e.outcome = 'CHANGED' AND b.state = 'COUNTED'
            AND b.finalization_basis = 'DOMAIN_CHANGED'
            AND r.outcome = 'COMPLETED'
            AND r.audit_event_id = e.audit_event_id)
          OR (e.outcome = 'UNCHANGED' AND b.state = 'IGNORED'
            AND b.finalization_basis = 'DOMAIN_UNCHANGED'
            AND r.outcome = 'LINK_UNAVAILABLE'
            AND r.audit_event_id IS NULL AND e.audit_event_id IS NULL)
        )
    ) THEN
    RAISE EXCEPTION 'VAP1_RESET_TERMINAL_RECEIPT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF e.outcome = 'CHANGED' THEN
    -- 127+130 enforce the reciprocal exact-ID/generation/issue-audit FK.
    -- Recheck it here before accepting COUNTED terminalization as evidenced.
    IF NOT EXISTS (
      SELECT 1 FROM auth_proof_private.staff_password_reset_requests s
      JOIN public.account_security_audit_events a
        ON a.id = s.issue_audit_event_id
      WHERE s.audience = b.audience AND s.operation_id = b.operation_id
        AND s.id = e.reset_id AND s.generation = e.reset_generation
        AND s.issue_audit_event_id = e.audit_event_id
        AND s.request_fingerprint = b.request_fingerprint
        AND s.organization_id = b.organization_id
        AND s.target_user_id = b.target_user_id
        AND s.issuer_user_id = b.issuer_user_id
        AND s.issued_by_membership_id = b.issuer_membership_id
        AND a.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'
        AND a.actor_type = 'USER'
        AND a.actor_user_id = b.issuer_user_id
        AND a.subject_user_id = b.target_user_id
    ) THEN
      RAISE EXCEPTION 'VAP1_RESET_TERMINAL_RECEIPT_DENIED'
        USING ERRCODE = '42501';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM auth_proof_private.staff_password_reset_requests s
    WHERE s.audience = b.audience AND s.operation_id = b.operation_id
  ) THEN
    RAISE EXCEPTION 'VAP1_RESET_TERMINAL_RECEIPT_DENIED'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER issue416_reset_quota_terminal_receipt_guard
  AFTER INSERT OR UPDATE ON auth_proof_private.reset_issue_quota_bundles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_reset_quota_terminal_receipt();
REVOKE ALL ON FUNCTION auth_proof_private.assert_reset_quota_terminal_receipt()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

-- Dormant reset rows require a committed authenticated command, immutable
-- account-security audit and exact domain-evidence generation linkage.
BEGIN;
SET ROLE vap1_proof_owner;

ALTER TABLE auth_proof_private.reset_issue_domain_evidence
  ADD CONSTRAINT issue416_reset_evidence_generation_identity_fk
  FOREIGN KEY (
    audience,operation_id,reset_id,reset_generation,audit_event_id,
    request_fingerprint
  ) REFERENCES auth_proof_private.staff_password_reset_requests (
    audience,operation_id,id,generation,issue_audit_event_id,
    request_fingerprint
  ) ON UPDATE RESTRICT ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION auth_proof_private.assert_reset_credential_receipts()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- Even a valid-looking issuer/audit UUID is insufficient without its
  -- immutable receipt and consumed exact-purpose VAP1 challenge.
  IF NOT EXISTS (
    SELECT 1
    FROM auth_proof_private.operation_receipts r
    JOIN auth_proof_private.proof_challenges c
      ON c.challenge_id = r.challenge_id
    JOIN public.account_security_audit_events a
      ON a.id = r.audit_event_id
    WHERE r.audience = NEW.audience
      AND r.operation_id = NEW.operation_id
      AND r.purpose = 'RESET_ISSUE' AND r.outcome = 'COMPLETED'
      AND r.audit_event_id = NEW.issue_audit_event_id
      AND r.payload_digest = c.payload_digest
      AND r.state_digest = c.state_digest
      AND c.audience = r.audience
      AND c.operation_id = r.operation_id
      AND c.purpose = 'RESET_ISSUE' AND c.consumed_at IS NOT NULL
      AND c.actor_kind = 'STAFF'
      AND c.actor_user_id = NEW.issuer_user_id
      AND c.actor_session_id IS NOT NULL
      AND c.organization_id = NEW.organization_id
      AND c.membership_id = NEW.issued_by_membership_id
      AND c.subject_user_id = NEW.target_user_id
      AND a.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'
      AND a.actor_type = 'USER'
      AND a.actor_user_id = NEW.issuer_user_id
      AND a.subject_user_id = NEW.target_user_id
  ) THEN
    RAISE EXCEPTION 'VAP1_RESET_ISSUE_RECEIPT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.consumed_at IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM auth_proof_private.operation_receipts r
    JOIN auth_proof_private.proof_challenges c
      ON c.challenge_id = r.challenge_id
    JOIN public.account_security_audit_events a
      ON a.id = r.audit_event_id
    WHERE r.audience = NEW.audience
      AND r.operation_id = NEW.redeem_operation_id
      AND r.purpose = 'RESET_REDEEM' AND r.outcome = 'COMPLETED'
      AND r.audit_event_id = NEW.redeem_audit_event_id
      AND r.payload_digest = c.payload_digest
      AND r.state_digest = c.state_digest
      AND c.audience = r.audience
      AND c.operation_id = r.operation_id
      AND c.purpose = 'RESET_REDEEM' AND c.consumed_at IS NOT NULL
      AND c.actor_kind = 'ANONYMOUS'
      AND c.actor_user_id IS NULL AND c.actor_session_id IS NULL
      AND c.organization_id = NEW.organization_id
      AND c.subject_user_id = NEW.target_user_id
      AND a.event_type = 'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'
      AND a.actor_type = 'ANONYMOUS' AND a.actor_user_id IS NULL
      AND a.subject_user_id = NEW.target_user_id
  ) THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_RECEIPT_DENIED'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER issue416_reset_credential_receipt_guard
  AFTER INSERT OR UPDATE
  ON auth_proof_private.staff_password_reset_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_reset_credential_receipts();

REVOKE ALL ON FUNCTION auth_proof_private.assert_reset_credential_receipts()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

-- Issue416 R03: private, exact one-use receipt identity substrate only.
-- A U2 genuine vspr1 possession signer, typed proof validator, L1 admission
-- locks and atomic User/SS/P writer DO NOT EXIST here. Migration130 continues
-- to DENY every consumption. This table never itself authorizes a redeem.
BEGIN;
SET ROLE vap1_proof_owner;

ALTER TABLE auth_proof_private.staff_password_reset_requests
  ADD CONSTRAINT issue416_reset_redeem_exact_identity_key UNIQUE (
    audience,id,generation,token_hash,organization_id,target_user_id,
    issuer_user_id,issued_by_membership_id,operation_id,
    redeem_operation_id,redeem_audit_event_id
  );

CREATE TABLE auth_proof_private.reset_redeem_domain_evidence (
  audience text NOT NULL CHECK (
    audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  redeem_operation_id uuid NOT NULL,
  reset_id uuid NOT NULL,
  reset_generation bigint NOT NULL CHECK (reset_generation > 0),
  token_hash text NOT NULL CHECK (
    token_hash ~ '^staff-password-reset-sha256:v1:[0-9a-f]{64}$'
  ),
  organization_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  issuer_user_id uuid NOT NULL,
  issuer_membership_id uuid NOT NULL,
  issue_operation_id uuid NOT NULL,
  challenge_id uuid NOT NULL UNIQUE
    REFERENCES auth_proof_private.proof_challenges(challenge_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
  payload_digest bytea NOT NULL CHECK (pg_catalog.octet_length(payload_digest) = 32),
  state_digest bytea NOT NULL CHECK (pg_catalog.octet_length(state_digest) = 32),
  audit_event_id uuid NOT NULL UNIQUE REFERENCES public.account_security_audit_events(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (audience,redeem_operation_id),
  UNIQUE (reset_id),
  FOREIGN KEY (audience,redeem_operation_id)
    REFERENCES auth_proof_private.operation_receipts(audience,operation_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (audience,reset_id,reset_generation,token_hash,
    organization_id,target_user_id,issuer_user_id,issuer_membership_id,
    issue_operation_id,redeem_operation_id,audit_event_id)
    REFERENCES auth_proof_private.staff_password_reset_requests (
      audience,id,generation,token_hash,organization_id,target_user_id,
      issuer_user_id,issued_by_membership_id,operation_id,
      redeem_operation_id,redeem_audit_event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

-- Evidence cannot be re-keyed to another bearer, operation or audit, nor
-- erased after a later owner-scoped reconciliation. No ordinary writer grant.
CREATE FUNCTION auth_proof_private.deny_reset_redeem_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'VAP1_RESET_REDEEM_EVIDENCE_IMMUTABLE'
    USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER issue416_reset_redeem_evidence_immutable
  BEFORE UPDATE OR DELETE ON auth_proof_private.reset_redeem_domain_evidence
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.deny_reset_redeem_evidence_mutation();

-- Every consumed row must have exactly one committed, purpose-specific
-- evidence row (and vice versa); never infer genuine token possession merely
-- from a matching hash/receipt. The separate 130 DENY must remain installed.
CREATE FUNCTION auth_proof_private.assert_exact_reset_redeem_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_reset_id uuid;
  r auth_proof_private.staff_password_reset_requests%ROWTYPE;
  e auth_proof_private.reset_redeem_domain_evidence%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'reset_redeem_domain_evidence' THEN
    v_reset_id := NEW.reset_id;
  ELSE
    v_reset_id := NEW.id;
  END IF;
  SELECT * INTO r FROM auth_proof_private.staff_password_reset_requests x
  WHERE x.id = v_reset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_EVIDENCE_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO e FROM auth_proof_private.reset_redeem_domain_evidence x
  WHERE x.reset_id = r.id;
  IF r.consumed_at IS NULL THEN
    IF FOUND THEN
      RAISE EXCEPTION 'VAP1_RESET_REDEEM_EVIDENCE_DENIED' USING ERRCODE = '42501';
    END IF;
    RETURN NULL;
  END IF;
  IF NOT FOUND OR r.consumed_at < r.created_at
    OR r.consumed_at >= r.expires_at
    OR e.audience IS DISTINCT FROM r.audience
    OR e.redeem_operation_id IS DISTINCT FROM r.redeem_operation_id
    OR e.reset_generation IS DISTINCT FROM r.generation
    OR e.token_hash IS DISTINCT FROM r.token_hash
    OR e.organization_id IS DISTINCT FROM r.organization_id
    OR e.target_user_id IS DISTINCT FROM r.target_user_id
    OR e.issuer_user_id IS DISTINCT FROM r.issuer_user_id
    OR e.issuer_membership_id IS DISTINCT FROM r.issued_by_membership_id
    OR e.issue_operation_id IS DISTINCT FROM r.operation_id
    OR e.audit_event_id IS DISTINCT FROM r.redeem_audit_event_id
    OR NOT EXISTS (
      SELECT 1 FROM auth_proof_private.operation_receipts o
      JOIN auth_proof_private.proof_challenges c
        ON c.challenge_id = o.challenge_id
      JOIN public.account_security_audit_events a
        ON a.id = o.audit_event_id
      WHERE o.audience = r.audience
        AND o.operation_id = r.redeem_operation_id
        AND o.purpose = 'RESET_REDEEM' AND o.outcome = 'COMPLETED'
        AND o.challenge_id = e.challenge_id
        AND o.audit_event_id = r.redeem_audit_event_id
        AND o.payload_digest = e.payload_digest
        AND o.state_digest = e.state_digest
        AND o.payload_digest = c.payload_digest
        AND o.state_digest = c.state_digest
        AND c.audience = o.audience AND c.operation_id = o.operation_id
        AND c.purpose = 'RESET_REDEEM' AND c.consumed_at IS NOT NULL
        AND c.actor_kind = 'ANONYMOUS' AND c.actor_user_id IS NULL
        AND c.actor_session_id IS NULL AND c.membership_id IS NULL
        AND c.organization_id = r.organization_id
        AND c.subject_user_id = r.target_user_id
        AND a.event_type = 'STAFF_PASSWORD_RESET_PASSWORD_CHANGED'
        AND a.actor_type = 'ANONYMOUS' AND a.actor_user_id IS NULL
        AND a.subject_user_id = r.target_user_id
    ) THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_EVIDENCE_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER issue416_reset_redeem_evidence_complete
  AFTER INSERT OR UPDATE ON auth_proof_private.reset_redeem_domain_evidence
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_exact_reset_redeem_evidence();
CREATE CONSTRAINT TRIGGER issue416_reset_credential_redeem_complete
  AFTER INSERT OR UPDATE ON auth_proof_private.staff_password_reset_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_exact_reset_redeem_evidence();

REVOKE ALL ON TABLE auth_proof_private.reset_redeem_domain_evidence FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.deny_reset_redeem_evidence_mutation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_exact_reset_redeem_evidence()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

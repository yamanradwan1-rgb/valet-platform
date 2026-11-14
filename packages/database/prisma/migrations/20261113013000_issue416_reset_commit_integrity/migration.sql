-- Issue416 R02/R03 hardening, strictly dormant. Preserve existing migrations.
-- R02 CHANGE must atomically persist both the reset row and its exact evidence.
-- R03 cannot be admitted merely from a receipt carrying a digest: a real typed
-- verifier must bind the submitted raw bearer (outside SQL), hash, generation,
-- reset UUID and canonical signed payload in one authorized operation.
BEGIN;
SET ROLE vap1_proof_owner;

-- Migration127 already gives evidence -> row, including exact identity,
-- audit and fingerprint. Add the reciprocal COMMIT-deferred direction. Because
-- migration120 evidence -> quota bundle and its deferred exactly-four-entry
-- integrity exist, every committed changed reset row now requires all four
-- exact private quota scopes, a consumed issue proof and domain evidence.
ALTER TABLE auth_proof_private.reset_issue_domain_evidence
  ADD CONSTRAINT issue416_reset_evidence_exact_identity_key
  UNIQUE (
    audience,operation_id,reset_id,reset_generation,audit_event_id,
    request_fingerprint
  );
ALTER TABLE auth_proof_private.staff_password_reset_requests
  ADD CONSTRAINT issue416_reset_credential_requires_evidence_fk
  FOREIGN KEY (
    audience,operation_id,id,generation,issue_audit_event_id,
    request_fingerprint
  ) REFERENCES auth_proof_private.reset_issue_domain_evidence (
    audience,operation_id,reset_id,reset_generation,audit_event_id,
    request_fingerprint
  ) ON UPDATE RESTRICT ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

-- Any earlier purportedly redeemed credential lacks a proved canonical R03
-- binding. Refuse to install a policy over ambiguous prior consumption.
DO $issue416_unproved_redeem$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth_proof_private.staff_password_reset_requests
    WHERE consumed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_PREEXISTING_UNVERIFIED'
      USING ERRCODE = '42501';
  END IF;
END;
$issue416_unproved_redeem$;

-- Independent expiry gate retained even if a future separately authorized R03
-- command replaces the following fail-closed signed-identity gate. A caller
-- cannot backdate consumption. Commit-deferred check closes expiry during tx.
CREATE FUNCTION auth_proof_private.enforce_reset_redeem_db_clock()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_now timestamptz(6);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL THEN
    v_now := pg_catalog.clock_timestamp();
    IF v_now >= OLD.expires_at THEN
      RAISE EXCEPTION 'VAP1_RESET_REDEEM_EXPIRED'
        USING ERRCODE = '42501';
    END IF;
    NEW.consumed_at := v_now;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue416_reset_redeem_clock_guard
  BEFORE INSERT OR UPDATE
  ON auth_proof_private.staff_password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.enforce_reset_redeem_db_clock();

CREATE FUNCTION auth_proof_private.assert_reset_redeem_commit_clock()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE'
        USING ERRCODE = '42501';
    END IF;
    RETURN NULL;
  END IF;
  IF OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL
    AND pg_catalog.clock_timestamp() >= NEW.expires_at THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_EXPIRED'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER issue416_reset_redeem_expiry_commit
  AFTER INSERT OR UPDATE
  ON auth_proof_private.staff_password_reset_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_reset_redeem_commit_clock();

-- The existing receipt trigger checks purpose/actor/subject/audit, but not a
-- trusted R03 canonical payload (reset_id/generation/token_hash/User/SS/P).
-- Receipt digests alone are not authority. Until genuine signer/typed SQL
-- writer exists, reject every consumed transition, including forged receipts.
CREATE FUNCTION auth_proof_private.reject_unbound_reset_redemption()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'VAP1_RESET_REDEEM_SIGNED_IDENTITY_UNAVAILABLE'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue416_reset_redeem_unproven_guard
  BEFORE INSERT OR UPDATE
  ON auth_proof_private.staff_password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.reject_unbound_reset_redemption();

REVOKE ALL ON FUNCTION auth_proof_private.enforce_reset_redeem_db_clock()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_reset_redeem_commit_clock()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.reject_unbound_reset_redemption()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

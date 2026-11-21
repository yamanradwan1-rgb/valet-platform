-- Issue #416 R02/R03: dormant, owner-private credential generation ledger.
-- No runtime grants, callable reset writer, plaintext token or token recovery.
BEGIN;
GRANT REFERENCES(organization_id,id,user_id)
  ON TABLE public.organization_memberships TO vap1_proof_owner;
GRANT REFERENCES(id) ON TABLE public.account_security_audit_events
  TO vap1_proof_owner;
SET ROLE vap1_proof_owner;

CREATE TABLE auth_proof_private.staff_password_reset_requests (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  audience text NOT NULL CHECK (
    audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  organization_id uuid NOT NULL,
  target_membership_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  issued_by_membership_id uuid NOT NULL,
  issuer_user_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_fingerprint bytea NOT NULL CHECK (
    pg_catalog.octet_length(request_fingerprint) = 32
  ),
  generation bigint NOT NULL CHECK (generation > 0),
  token_hash text NOT NULL CHECK (
    token_hash ~ '^staff-password-reset-sha256:v1:[0-9a-f]{64}$'
  ),
  created_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz(6) NOT NULL,
  consumed_at timestamptz(6),
  revoked_at timestamptz(6),
  issue_audit_event_id uuid NOT NULL UNIQUE
    REFERENCES public.account_security_audit_events(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  redeem_operation_id uuid,
  redeem_audit_event_id uuid UNIQUE
    REFERENCES public.account_security_audit_events(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,target_membership_id,target_user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,issued_by_membership_id,issuer_user_id)
    REFERENCES public.organization_memberships(organization_id,id,user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (organization_id,operation_id),
  UNIQUE (target_user_id,generation),
  UNIQUE (token_hash),
  UNIQUE (
    audience,operation_id,id,generation,issue_audit_event_id,
    request_fingerprint
  ),
  CHECK (expires_at = created_at + INTERVAL '15 minutes'),
  CHECK (consumed_at IS NULL OR revoked_at IS NULL),
  CHECK (
    (consumed_at IS NULL AND redeem_operation_id IS NULL
      AND redeem_audit_event_id IS NULL)
    OR (consumed_at IS NOT NULL AND redeem_operation_id IS NOT NULL
      AND redeem_audit_event_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX issue416_one_unconsumed_reset_per_user
  ON auth_proof_private.staff_password_reset_requests(target_user_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX issue416_reset_credential_generation_lookup
  ON auth_proof_private.staff_password_reset_requests
    (target_user_id,generation DESC);

-- Both timestamps are always database-derived. A future writer cannot
-- select a different issuance clock, expiry duration, or grace window.
CREATE FUNCTION auth_proof_private.set_reset_credential_db_clock()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  NEW.created_at := pg_catalog.clock_timestamp();
  NEW.expires_at := NEW.created_at + INTERVAL '15 minutes';
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue416_reset_credential_db_clock
  BEFORE INSERT ON auth_proof_private.staff_password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.set_reset_credential_db_clock();

CREATE FUNCTION auth_proof_private.guard_reset_credential_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VAP1_RESET_CREDENTIAL_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;
  IF ROW(NEW.id,NEW.audience,NEW.organization_id,
    NEW.target_membership_id,NEW.target_user_id,
    NEW.issued_by_membership_id,NEW.issuer_user_id,NEW.operation_id,
    NEW.request_fingerprint,NEW.generation,NEW.token_hash,
    NEW.created_at,NEW.expires_at,NEW.issue_audit_event_id)
    IS DISTINCT FROM ROW(OLD.id,OLD.audience,OLD.organization_id,
    OLD.target_membership_id,OLD.target_user_id,
    OLD.issued_by_membership_id,OLD.issuer_user_id,OLD.operation_id,
    OLD.request_fingerprint,OLD.generation,OLD.token_hash,
    OLD.created_at,OLD.expires_at,OLD.issue_audit_event_id)
    OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at
      IS DISTINCT FROM OLD.consumed_at)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at
      IS DISTINCT FROM OLD.revoked_at)
    OR (OLD.redeem_operation_id IS NOT NULL AND NEW.redeem_operation_id
      IS DISTINCT FROM OLD.redeem_operation_id)
    OR (OLD.redeem_audit_event_id IS NOT NULL AND NEW.redeem_audit_event_id
      IS DISTINCT FROM OLD.redeem_audit_event_id)
  THEN
    RAISE EXCEPTION 'VAP1_RESET_CREDENTIAL_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue416_reset_credential_lifecycle
  BEFORE UPDATE OR DELETE
  ON auth_proof_private.staff_password_reset_requests
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.guard_reset_credential_lifecycle();

REVOKE ALL ON TABLE auth_proof_private.staff_password_reset_requests
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.set_reset_credential_db_clock()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.guard_reset_credential_lifecycle()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

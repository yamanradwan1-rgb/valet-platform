-- Issue416 R02 migration120: private storage and immutable integrity triggers.
BEGIN;
-- Issue #416 R02: dormant, private, atomic four-scope reset-issuance quota.
-- This intentionally has no ordinary runtime EXECUTE/USAGE/table privileges.
-- A dedicated private ledger is required: the legacy public anti_abuse_events
-- UPDATE(state) role and one-hour cleanup must never discount/delete R02 proof.
-- R03 public-address and credential-attempt quotas remain a separate contract.

-- This role is NOLOGIN/NOINHERIT and exclusively provisioned by migration 113.
-- The future authenticated R02 writer must be the ONLY runtime entrypoint.
GRANT SELECT, REFERENCES ON public.account_security_audit_events TO vap1_proof_owner;
SET ROLE vap1_proof_owner;

CREATE TABLE auth_proof_private.reset_issue_quota_bundles (
  audience text NOT NULL CHECK (audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'),
  operation_id uuid NOT NULL,
  request_fingerprint bytea NOT NULL
    CHECK (pg_catalog.octet_length(request_fingerprint) = 32),
  issuer_user_id uuid NOT NULL,
  issuer_membership_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_membership_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  target_hash text NOT NULL,
  issuer_hash text NOT NULL,
  organization_hash text NOT NULL,
  client_address_hash text NOT NULL,
  reserved_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  state text NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING','COUNTED','IGNORED')),
  finalized_at timestamptz(6),
  finalization_basis text CHECK (finalization_basis IN
    ('DOMAIN_CHANGED','DOMAIN_UNCHANGED','EXPIRED_UNRESOLVED')),
  PRIMARY KEY (audience,operation_id),
  CHECK (
    target_hash ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    AND issuer_hash ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    AND organization_hash ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    AND client_address_hash ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
  ),
  CHECK ((state = 'PENDING' AND finalized_at IS NULL AND finalization_basis IS NULL)
    OR (state <> 'PENDING' AND finalized_at IS NOT NULL
      AND finalization_basis IS NOT NULL))
);

CREATE TABLE auth_proof_private.reset_issue_quota_entries (
  reservation_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  audience text NOT NULL,
  operation_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN (
    'v1:staff-password-reset-issue-target-user',
    'v1:staff-password-reset-issue-issuer-user',
    'v1:staff-password-reset-issue-organization',
    'v1:staff-password-reset-issue-client-address'
  )),
  key_hash text NOT NULL
    CHECK (key_hash ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'),
  key_digest bytea GENERATED ALWAYS AS (
    pg_catalog.decode(pg_catalog.split_part(key_hash, ':', 3), 'hex')
  ) STORED,
  occurred_at timestamptz(6) NOT NULL,
  state text NOT NULL DEFAULT 'PENDING'
    CHECK (state IN ('PENDING','COUNTED','IGNORED')),
  FOREIGN KEY (audience,operation_id)
    REFERENCES auth_proof_private.reset_issue_quota_bundles(audience,operation_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  UNIQUE (audience,operation_id,scope)
);
CREATE INDEX vap1_reset_issue_quota_rolling_window
  ON auth_proof_private.reset_issue_quota_entries(scope,key_hash,occurred_at)
  WHERE state IN ('PENDING','COUNTED');

-- Only the future signed/domain-authorized R02 command may insert this
-- *inside the same transaction* as its reset generation, private proof receipt
-- and staff-password-reset audit. There is deliberately no callable setter.
CREATE TABLE auth_proof_private.reset_issue_domain_evidence (
  audience text NOT NULL,
  operation_id uuid NOT NULL,
  request_fingerprint bytea NOT NULL
    CHECK (pg_catalog.octet_length(request_fingerprint) = 32),
  challenge_id uuid NOT NULL UNIQUE
    REFERENCES auth_proof_private.proof_challenges(challenge_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('CHANGED','UNCHANGED')),
  reset_id uuid,
  reset_generation bigint,
  audit_event_id uuid REFERENCES public.account_security_audit_events(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  recorded_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (audience,operation_id),
  FOREIGN KEY (audience,operation_id)
    REFERENCES auth_proof_private.reset_issue_quota_bundles(audience,operation_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK ((outcome = 'CHANGED' AND reset_id IS NOT NULL
    AND reset_generation IS NOT NULL AND reset_generation > 0
    AND audit_event_id IS NOT NULL)
    OR (outcome = 'UNCHANGED' AND reset_id IS NULL
      AND reset_generation IS NULL AND audit_event_id IS NULL))
);

CREATE FUNCTION auth_proof_private.reset_issue_quota_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'reset_issue_domain_evidence' THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'VAP1_RESET_EVIDENCE_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'reset_issue_quota_bundles' THEN
    IF ROW(NEW.audience,NEW.operation_id,NEW.request_fingerprint,
      NEW.issuer_user_id,NEW.issuer_membership_id,NEW.target_user_id,
      NEW.target_membership_id,NEW.organization_id,NEW.target_hash,
      NEW.issuer_hash,NEW.organization_hash,NEW.client_address_hash,
      NEW.reserved_at) IS DISTINCT FROM ROW(
      OLD.audience,OLD.operation_id,OLD.request_fingerprint,
      OLD.issuer_user_id,OLD.issuer_membership_id,OLD.target_user_id,
      OLD.target_membership_id,OLD.organization_id,OLD.target_hash,
      OLD.issuer_hash,OLD.organization_hash,OLD.client_address_hash,
      OLD.reserved_at) OR OLD.state <> 'PENDING'
      OR NEW.state NOT IN ('COUNTED','IGNORED') THEN
      RAISE EXCEPTION 'VAP1_RESET_QUOTA_IMMUTABLE' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.reservation_id,NEW.audience,NEW.operation_id,NEW.scope,
    NEW.key_hash,NEW.occurred_at) IS DISTINCT FROM ROW(
    OLD.reservation_id,OLD.audience,OLD.operation_id,OLD.scope,
    OLD.key_hash,OLD.occurred_at) OR OLD.state <> 'PENDING'
    OR NEW.state NOT IN ('COUNTED','IGNORED') THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vap1_reset_bundle_guard
  BEFORE UPDATE OR DELETE ON auth_proof_private.reset_issue_quota_bundles
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.reset_issue_quota_guard();
CREATE TRIGGER vap1_reset_entry_guard
  BEFORE UPDATE OR DELETE ON auth_proof_private.reset_issue_quota_entries
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.reset_issue_quota_guard();
CREATE TRIGGER vap1_reset_evidence_guard
  BEFORE UPDATE OR DELETE ON auth_proof_private.reset_issue_domain_evidence
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.reset_issue_quota_guard();

-- Enforce the invariant at COMMIT, including against partial direct owner DML:
-- exactly four matching hashes/states/timestamps must accompany every bundle.
-- Deferral is necessary because the initial bundle row precedes its entries,
-- while finalization updates all entries and then the parent within one tx.
CREATE FUNCTION auth_proof_private.assert_reset_issue_bundle_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_bundle auth_proof_private.reset_issue_quota_bundles%ROWTYPE;
  v_count bigint;
BEGIN
  SELECT * INTO v_bundle
  FROM auth_proof_private.reset_issue_quota_bundles b
  WHERE b.audience = NEW.audience AND b.operation_id = NEW.operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  SELECT pg_catalog.count(*) INTO v_count
  FROM auth_proof_private.reset_issue_quota_entries e
  WHERE e.audience = NEW.audience AND e.operation_id = NEW.operation_id
    AND e.state = v_bundle.state AND e.occurred_at = v_bundle.reserved_at
    AND (
      (e.scope = 'v1:staff-password-reset-issue-target-user'
        AND e.key_hash = v_bundle.target_hash)
      OR (e.scope = 'v1:staff-password-reset-issue-issuer-user'
        AND e.key_hash = v_bundle.issuer_hash)
      OR (e.scope = 'v1:staff-password-reset-issue-organization'
        AND e.key_hash = v_bundle.organization_hash)
      OR (e.scope = 'v1:staff-password-reset-issue-client-address'
        AND e.key_hash = v_bundle.client_address_hash)
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'VAP1_RESET_QUOTA_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER vap1_reset_bundle_integrity
  AFTER INSERT OR UPDATE ON auth_proof_private.reset_issue_quota_bundles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_reset_issue_bundle_integrity();
CREATE CONSTRAINT TRIGGER vap1_reset_entry_integrity
  AFTER INSERT OR UPDATE ON auth_proof_private.reset_issue_quota_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.assert_reset_issue_bundle_integrity();

-- The domain transaction, never the API or finalizer, creates evidence after
-- the signed RESET_ISSUE proof is consumed and business/audit receipt commits.
-- Evidence is insert-only; caller cannot send an arbitrary COUNTED/IGNORED.
CREATE FUNCTION auth_proof_private.validate_reset_issue_domain_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_bundle auth_proof_private.reset_issue_quota_bundles%ROWTYPE;
BEGIN
  SELECT * INTO v_bundle
  FROM auth_proof_private.reset_issue_quota_bundles b
  WHERE b.audience = NEW.audience AND b.operation_id = NEW.operation_id;
  IF NOT FOUND OR v_bundle.state <> 'PENDING'
    OR v_bundle.request_fingerprint IS DISTINCT FROM NEW.request_fingerprint
    OR NOT EXISTS (
      SELECT 1 FROM auth_proof_private.operation_receipts r
      JOIN auth_proof_private.proof_challenges c
        ON c.challenge_id = r.challenge_id
      WHERE r.audience = NEW.audience AND r.operation_id = NEW.operation_id
        AND r.purpose = 'RESET_ISSUE' AND r.challenge_id = NEW.challenge_id
        AND c.audience = NEW.audience AND c.operation_id = NEW.operation_id
        AND c.purpose = 'RESET_ISSUE' AND c.consumed_at IS NOT NULL
        AND c.actor_kind = 'STAFF'
        AND c.actor_user_id = v_bundle.issuer_user_id
        AND c.membership_id = v_bundle.issuer_membership_id
        AND c.organization_id = v_bundle.organization_id
        AND c.subject_user_id = v_bundle.target_user_id
        AND ((NEW.outcome = 'CHANGED' AND r.outcome = 'COMPLETED'
          AND r.audit_event_id = NEW.audit_event_id)
          OR (NEW.outcome = 'UNCHANGED' AND r.outcome = 'LINK_UNAVAILABLE'
            AND r.audit_event_id IS NULL))
    ) OR (NEW.outcome = 'CHANGED' AND NOT EXISTS (
      SELECT 1 FROM public.account_security_audit_events a
      WHERE a.id = NEW.audit_event_id
        AND a.event_type = 'STAFF_PASSWORD_RESET_LINK_ISSUED'
        AND a.actor_type = 'USER'
        AND a.actor_user_id = v_bundle.issuer_user_id
        AND a.subject_user_id = v_bundle.target_user_id
    ))
  THEN
    RAISE EXCEPTION 'VAP1_RESET_DOMAIN_EVIDENCE_DENIED'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vap1_reset_evidence_source_guard
  BEFORE INSERT ON auth_proof_private.reset_issue_domain_evidence
  FOR EACH ROW
  EXECUTE FUNCTION auth_proof_private.validate_reset_issue_domain_evidence();

REVOKE ALL ON ALL TABLES IN SCHEMA auth_proof_private FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.reset_issue_quota_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_reset_issue_bundle_integrity()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.validate_reset_issue_domain_evidence()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

-- Issue416 R03: SOURCE-ONLY protected attempt accounting. DENIED until a
-- separately attested pre-parser caller binds the real client IP and an
-- authenticated canonical credential HMAC. Never grant private table access.
BEGIN;
SET ROLE vap1_proof_owner;

-- Trigger 00 deliberately rejects every INSERT before trigger 10 is reached.
-- An untrusted SQL caller may know the opaque IDs/digests but cannot prove
-- possession of the request IP, the reset bearer or the HMAC key.
CREATE FUNCTION auth_proof_private.deny_unbound_r03_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'VAP1_R03_TRUSTED_BINDER_UNAVAILABLE'
    USING ERRCODE = '42501';
END;
$$;

-- Future approved, ingress-only binder must run on a distinct *committed*
-- READ COMMITTED lease before any body parser (client) or business tx
-- (credential). Failed business transactions never undo these counted rows.
CREATE FUNCTION auth_proof_private.guard_r03_counted_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_scope text;
  v_limit integer;
  v_now timestamptz(6);
  v_count bigint;
  v_client_xid numeric(20,0);
  v_client_at timestamptz(6);
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    OR NEW.audience IS NULL OR NEW.request_id IS NULL
    OR NEW.key_hash IS NULL OR NEW.key_hash !~
      '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'VAP1_R03_ATTEMPT_INVALID'
      USING ERRCODE = '42501';
  END IF;
  v_limit := CASE TG_TABLE_NAME
    WHEN 'reset_redeem_client_attempts' THEN 30
    WHEN 'reset_redeem_credential_attempts' THEN 5
    ELSE NULL END;
  v_scope := CASE TG_TABLE_NAME
    WHEN 'reset_redeem_client_attempts'
      THEN 'v1:staff-password-reset-redeem-client-address'
    WHEN 'reset_redeem_credential_attempts'
      THEN 'v1:staff-password-reset-redeem-credential'
    ELSE NULL END;
  IF v_limit IS NULL OR v_scope IS NULL THEN
    RAISE EXCEPTION 'VAP1_R03_ATTEMPT_INVALID'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'reset_redeem_credential_attempts' THEN
    SELECT c.reservation_xid,c.occurred_at INTO v_client_xid,v_client_at
    FROM auth_proof_private.reset_redeem_client_attempts c
    WHERE c.audience = NEW.audience
      AND c.request_id = NEW.request_id
      AND c.id = NEW.client_attempt_id;
    -- The client row must be from an already committed earlier transaction;
    -- the same-transaction two-stage path cannot satisfy this check.
    IF NOT FOUND OR v_client_xid =
      pg_catalog.pg_current_xact_id()::text::numeric
      OR NEW.client_attempt_id IS NULL THEN
      RAISE EXCEPTION 'VAP1_R03_CLIENT_LEASE_NOT_COMMITTED'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Register exactly the two purpose-specific scopes, never a caller scope.
  -- Advisory collisions only serialize extra keys; READ COMMITTED takes the
  -- window snapshot after this lock is obtained.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      NEW.audience || ':' || v_scope || ':' || NEW.key_hash, 41603
    )
  );
  v_now := pg_catalog.clock_timestamp();
  IF TG_TABLE_NAME = 'reset_redeem_credential_attempts' THEN
    IF v_client_at <= v_now - INTERVAL '15 minutes'
      OR v_client_at > v_now THEN
      RAISE EXCEPTION 'VAP1_R03_CLIENT_LEASE_NOT_COMMITTED'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'reset_redeem_client_attempts' THEN
    SELECT pg_catalog.count(*) INTO v_count
    FROM auth_proof_private.reset_redeem_client_attempts a
    WHERE a.audience = NEW.audience AND a.key_hash = NEW.key_hash
      AND a.occurred_at > v_now - INTERVAL '15 minutes'
      AND a.occurred_at <= v_now;
  ELSE
    SELECT pg_catalog.count(*) INTO v_count
    FROM auth_proof_private.reset_redeem_credential_attempts a
    WHERE a.audience = NEW.audience AND a.key_hash = NEW.key_hash
      AND a.occurred_at > v_now - INTERVAL '15 minutes'
      AND a.occurred_at <= v_now;
  END IF;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'VAP1_R03_ATTEMPT_QUOTA_EXHAUSTED'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.occurred_at := v_now;
  NEW.reservation_xid := pg_catalog.pg_current_xact_id()::text::numeric;
  RETURN NEW;
END;
$$;

CREATE FUNCTION auth_proof_private.reject_r03_attempt_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'VAP1_R03_ATTEMPT_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;

-- PostgreSQL executes same-event/same-timing triggers alphabetically.
-- Any later activation must remove 00 only after genuine binder, role
-- isolation, key custody and PG17 concurrency tests. No SET GUC bypass.
CREATE TRIGGER issue416_r03_00_client_unbound
  BEFORE INSERT ON auth_proof_private.reset_redeem_client_attempts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.deny_unbound_r03_attempt();
CREATE TRIGGER issue416_r03_10_client_count
  BEFORE INSERT ON auth_proof_private.reset_redeem_client_attempts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.guard_r03_counted_attempt();
CREATE TRIGGER issue416_r03_00_credential_unbound
  BEFORE INSERT ON auth_proof_private.reset_redeem_credential_attempts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.deny_unbound_r03_attempt();
CREATE TRIGGER issue416_r03_10_credential_count
  BEFORE INSERT ON auth_proof_private.reset_redeem_credential_attempts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.guard_r03_counted_attempt();
CREATE TRIGGER issue416_r03_client_immutable
  BEFORE UPDATE OR DELETE ON auth_proof_private.reset_redeem_client_attempts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.reject_r03_attempt_mutation();
CREATE TRIGGER issue416_r03_credential_immutable
  BEFORE UPDATE OR DELETE ON auth_proof_private.reset_redeem_credential_attempts
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.reject_r03_attempt_mutation();
CREATE TRIGGER issue416_r03_client_no_truncate
  BEFORE TRUNCATE ON auth_proof_private.reset_redeem_client_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION auth_proof_private.reject_r03_attempt_mutation();
CREATE TRIGGER issue416_r03_credential_no_truncate
  BEFORE TRUNCATE ON auth_proof_private.reset_redeem_credential_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION auth_proof_private.reject_r03_attempt_mutation();

REVOKE ALL ON FUNCTION auth_proof_private.deny_unbound_r03_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.guard_r03_counted_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.reject_r03_attempt_mutation() FROM PUBLIC;
RESET ROLE;
COMMIT;

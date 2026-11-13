-- Option A: DB-held key material/version and cutover state are monotone.
-- This migration never inserts a key and never activates a staff proof.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.protect_key_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VAP1_KEY_RETIRE_ONLY' USING ERRCODE = '42501';
  END IF;
  IF NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.key_id IS DISTINCT FROM OLD.key_id
     OR NEW.root_key IS DISTINCT FROM OLD.root_key
     OR NEW.promotion_epoch IS DISTINCT FROM OLD.promotion_epoch
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'VAP1_KEY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF OLD.disposition = 'RETIRED'
     OR (OLD.disposition = 'VERIFY_ONLY' AND NEW.disposition <> 'VERIFY_ONLY'
         AND NEW.disposition <> 'RETIRED')
     OR (OLD.disposition = 'ACTIVE_SIGNING'
       AND NEW.disposition NOT IN ('ACTIVE_SIGNING','VERIFY_ONLY','RETIRED'))
     OR (NEW.disposition = 'RETIRED' AND NEW.retired_at IS NULL)
     OR (NEW.disposition <> 'RETIRED' AND NEW.retired_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'VAP1_KEY_STATE_INVALID' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vap1_keys_immutable_update
  BEFORE UPDATE OR DELETE ON auth_proof_private.proof_keys
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.protect_key_change();

CREATE FUNCTION auth_proof_private.protect_selection_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
DECLARE v_disposition text; v_epoch bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VAP1_KEY_SELECTION_IMMUTABLE'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
     NEW.audience IS DISTINCT FROM OLD.audience
     OR NEW.promotion_epoch <= OLD.promotion_epoch
     OR NEW.key_id IS NOT DISTINCT FROM OLD.key_id
  ) THEN
    RAISE EXCEPTION 'VAP1_KEY_SELECTION_STALE' USING ERRCODE = '42501';
  END IF;
  SELECT disposition,promotion_epoch INTO v_disposition,v_epoch
  FROM auth_proof_private.proof_keys
  WHERE audience = NEW.audience AND key_id = NEW.key_id FOR SHARE;
  IF NOT FOUND OR v_disposition <> 'ACTIVE_SIGNING'
     OR v_epoch <> NEW.promotion_epoch THEN
    RAISE EXCEPTION 'VAP1_KEY_SELECTION_INVALID' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vap1_selection_monotone
  BEFORE INSERT OR UPDATE OR DELETE ON auth_proof_private.key_selection
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.protect_selection_change();

CREATE FUNCTION auth_proof_private.protect_boundary_change()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'VAP1_BOUNDARY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF NEW.singleton IS DISTINCT FROM OLD.singleton
     OR NEW.boundary_epoch < OLD.boundary_epoch
     OR (OLD.phase = 'PROTECTED' AND NEW.phase <> 'PROTECTED')
     OR (OLD.phase = 'DRAINED' AND NEW.phase = 'LEGACY_COMPAT')
     OR (OLD.phase = 'LEGACY_COMPAT' AND NEW.phase = 'PROTECTED')
     OR (NEW.phase = 'PROTECTED'
       AND (NEW.deployment_audience IS NULL OR NEW.t0_audit_event_id IS NULL))
  THEN
    RAISE EXCEPTION 'VAP1_BOUNDARY_STALE' USING ERRCODE = '42501';
  END IF;
  IF NEW.phase IS DISTINCT FROM OLD.phase
     AND NEW.boundary_epoch <= OLD.boundary_epoch THEN
    RAISE EXCEPTION 'VAP1_BOUNDARY_EPOCH_STALE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vap1_boundary_monotone
  BEFORE UPDATE OR DELETE ON auth_proof_private.security_boundary
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.protect_boundary_change();

-- Certify installed pgcrypto catalog identity before any request signer can
-- rely on it; a writable extension namespace is never a trusted function
-- resolution path, even when the OID currently belongs to the extension.
DO $vap1$
DECLARE v_schema record;
BEGIN
  SELECT n.oid,n.nspowner,n.nspacl,n.nspname INTO STRICT v_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';
  IF EXISTS (
    SELECT 1 FROM pg_catalog.aclexplode(
      COALESCE(v_schema.nspacl,pg_catalog.acldefault('n',v_schema.nspowner))
    ) a
    WHERE a.privilege_type = 'CREATE' AND a.grantee <> v_schema.nspowner
  ) THEN
    RAISE EXCEPTION 'VAP1_UNTRUSTED_CRYPTO_SCHEMA'
      USING ERRCODE = '42501';
  END IF;
EXCEPTION WHEN no_data_found OR too_many_rows THEN
  RAISE EXCEPTION 'VAP1_PGCRYPTO_UNAVAILABLE' USING ERRCODE = '42501';
END;
$vap1$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_proof_private FROM PUBLIC;
RESET ROLE;
COMMIT;

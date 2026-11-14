-- A01 dormant operation-fingerprint substrate. This alone DOES NOT attest a
-- genuine password ceremony or authorize a pre-domain limiter writer.
-- Existing SQL runtime MUST NOT be able to populate private bindings.
-- Preserve earlier unbound rows as permanently INELIGIBLE: an unsafe NOT NULL
-- ADD would fail on populated historical tables; never invent provenance.
BEGIN;
SET ROLE vap1_proof_owner;
ALTER TABLE auth_proof_private.limiter_bindings
  ADD COLUMN request_fingerprint bytea
  CHECK (request_fingerprint IS NULL OR
    pg_catalog.octet_length(request_fingerprint) = 32);

-- New rows require a 32-byte commitment. Earlier NULL rows cannot acquire one
-- later, and bound row commitments cannot change. No SQL-only authenticated
-- writer or runtime admission is installed by this migration.
CREATE FUNCTION auth_proof_private.guard_a01_binding_fingerprint()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.request_fingerprint IS NULL OR
    pg_catalog.octet_length(NEW.request_fingerprint) <> 32 OR
    (TG_OP = 'UPDATE' AND (OLD.request_fingerprint IS NULL OR
      NEW.request_fingerprint IS DISTINCT FROM OLD.request_fingerprint))
  THEN
    RAISE EXCEPTION 'VAP1_A01_UNBOUND_RESERVATION_DENIED'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue416_a01_binding_fingerprint_guard
  BEFORE INSERT OR UPDATE ON auth_proof_private.limiter_bindings
  FOR EACH ROW EXECUTE FUNCTION
    auth_proof_private.guard_a01_binding_fingerprint();
REVOKE ALL ON TABLE auth_proof_private.limiter_bindings FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.guard_a01_binding_fingerprint()
  FROM PUBLIC;
RESET ROLE;
COMMIT;

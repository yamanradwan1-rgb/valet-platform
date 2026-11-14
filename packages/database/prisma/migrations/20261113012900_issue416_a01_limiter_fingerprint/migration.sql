-- A01 dormant operation-fingerprint substrate. This alone DOES NOT attest a
-- genuine password ceremony or authorize a pre-domain limiter writer.
-- Existing SQL runtime MUST NOT be able to populate private bindings.
BEGIN;
SET ROLE vap1_proof_owner;
ALTER TABLE auth_proof_private.limiter_bindings
  ADD COLUMN request_fingerprint bytea NOT NULL
  CHECK (pg_catalog.octet_length(request_fingerprint) = 32);
REVOKE ALL ON TABLE auth_proof_private.limiter_bindings FROM PUBLIC;
RESET ROLE;
COMMIT;

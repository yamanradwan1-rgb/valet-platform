-- Issue416 R03: private, counted-only attempt history for two distinct stages.
-- Storage is not an ingress capability. No runtime role may INSERT/UPDATE/DELETE.
-- Every malformed request still needs a committed client row before parsing;
-- a canonical credential additionally needs a separately committed verifier row.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE TABLE auth_proof_private.reset_redeem_client_attempts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  audience text NOT NULL CHECK (
    audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  request_id uuid NOT NULL,
  key_hash text NOT NULL CHECK (key_hash ~
    '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
  ),
  occurred_at timestamptz(6) NOT NULL,
  reservation_xid numeric(20,0) NOT NULL CHECK (
    reservation_xid > 0 AND reservation_xid <= 18446744073709551615
  ),
  -- One durable attempt per completed pre-parser transaction; a multi-row
  -- INSERT cannot evade a rolling cap through one statement snapshot.
  UNIQUE (reservation_xid),
  UNIQUE (audience,request_id),
  UNIQUE (audience,request_id,id)
);

CREATE INDEX issue416_r03_client_attempt_window
  ON auth_proof_private.reset_redeem_client_attempts
    (audience,key_hash,occurred_at);

CREATE TABLE auth_proof_private.reset_redeem_credential_attempts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  audience text NOT NULL CHECK (
    audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  request_id uuid NOT NULL,
  client_attempt_id uuid NOT NULL,
  key_hash text NOT NULL CHECK (key_hash ~
    '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
  ),
  occurred_at timestamptz(6) NOT NULL,
  reservation_xid numeric(20,0) NOT NULL CHECK (
    reservation_xid > 0 AND reservation_xid <= 18446744073709551615
  ),
  -- One canonical verifier attempt per committed, separate transaction.
  UNIQUE (reservation_xid),
  UNIQUE (audience,request_id),
  FOREIGN KEY (audience,request_id,client_attempt_id)
    REFERENCES auth_proof_private.reset_redeem_client_attempts
      (audience,request_id,id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX issue416_r03_credential_attempt_window
  ON auth_proof_private.reset_redeem_credential_attempts
    (audience,key_hash,occurred_at);

-- All attempts are counted. No mutable state, no user/caller-selectable TTL,
-- no discount marker and no public anti-abuse row reference or cleanup path.
REVOKE ALL ON TABLE auth_proof_private.reset_redeem_client_attempts FROM PUBLIC;
REVOKE ALL ON TABLE auth_proof_private.reset_redeem_credential_attempts FROM PUBLIC;
RESET ROLE;
COMMIT;

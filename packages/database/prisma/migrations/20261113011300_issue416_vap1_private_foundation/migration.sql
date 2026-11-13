-- Issue #416 / Option A. Additive, dormant private authority substrate.
-- No staff writer or runtime privilege is enabled by this migration.
BEGIN;
DO $vap1$
DECLARE
  v_migrator text := current_user;
  v_role record;
BEGIN
  SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
         rolreplication, rolbypassrls
    INTO v_role
    FROM pg_catalog.pg_roles WHERE rolname = 'vap1_proof_owner';
  IF NOT FOUND THEN
    CREATE ROLE vap1_proof_owner NOLOGIN NOINHERIT
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF v_role.rolcanlogin OR v_role.rolinherit
     OR v_role.rolsuper OR v_role.rolcreatedb
     OR v_role.rolcreaterole OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'Unsafe existing vap1_proof_owner role'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member
    WHERE r.rolname = 'vap1_proof_owner'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = m.member
    WHERE r.rolname = 'vap1_proof_owner' AND member.rolname <> v_migrator
  ) THEN
    RAISE EXCEPTION 'Unsafe existing vap1_proof_owner memberships'
      USING ERRCODE = '42501';
  END IF;
  -- Only the independently trusted migration principal may SET this NOLOGIN role.
  EXECUTE pg_catalog.format(
    'GRANT vap1_proof_owner TO %I WITH INHERIT FALSE, SET TRUE', v_migrator
  );
END;
$vap1$;

CREATE SCHEMA auth_proof_private AUTHORIZATION vap1_proof_owner;
-- Keep pgcrypto out of a new writable public schema. Existing extension
-- installations are not relocated; verifier validates their actual catalog OID.
CREATE SCHEMA IF NOT EXISTS auth_proof_crypto;
REVOKE CREATE ON SCHEMA auth_proof_crypto FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA auth_proof_crypto;
GRANT USAGE ON SCHEMA auth_proof_crypto TO vap1_proof_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE vap1_proof_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- A01 private operation-bound limiter binding has a forward FK to the
-- legacy durable reservation id. PostgreSQL requires REFERENCES privilege
-- on that id for this distinct NOLOGIN table owner at CREATE TABLE time.
GRANT REFERENCES(id) ON TABLE public.anti_abuse_events
  TO vap1_proof_owner;

SET ROLE vap1_proof_owner;
REVOKE ALL ON SCHEMA auth_proof_private FROM PUBLIC;

CREATE TABLE auth_proof_private.proof_keys (
  audience text NOT NULL CHECK (
    audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  key_id text NOT NULL CHECK (
    key_id ~ '^[A-Za-z][A-Za-z0-9._:-]{0,63}$'
  ),
  root_key bytea NOT NULL CHECK (pg_catalog.octet_length(root_key) = 32),
  promotion_epoch bigint NOT NULL CHECK (promotion_epoch > 0),
  disposition text NOT NULL CHECK (
    disposition IN ('ACTIVE_SIGNING','VERIFY_ONLY','RETIRED')
  ),
  created_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  retired_at timestamptz(6),
  PRIMARY KEY (audience, key_id),
  UNIQUE (audience, promotion_epoch),
  CHECK (disposition <> 'RETIRED' OR retired_at IS NOT NULL)
);
CREATE UNIQUE INDEX vap1_one_active_signing_per_audience
  ON auth_proof_private.proof_keys(audience)
  WHERE disposition = 'ACTIVE_SIGNING';

CREATE TABLE auth_proof_private.key_selection (
  audience text PRIMARY KEY,
  key_id text NOT NULL,
  promotion_epoch bigint NOT NULL CHECK (promotion_epoch > 0),
  updated_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  FOREIGN KEY (audience, key_id)
    REFERENCES auth_proof_private.proof_keys(audience, key_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE auth_proof_private.security_boundary (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase text NOT NULL DEFAULT 'LEGACY_COMPAT'
    CHECK (phase IN ('LEGACY_COMPAT','DRAINED','PROTECTED')),
  deployment_audience text CHECK (
    deployment_audience ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$'
  ),
  boundary_epoch bigint NOT NULL DEFAULT 1 CHECK (boundary_epoch > 0),
  t0_audit_event_id uuid,
  changed_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (phase <> 'PROTECTED' OR t0_audit_event_id IS NOT NULL)
);
INSERT INTO auth_proof_private.security_boundary(singleton)
VALUES (true);

-- Frozen U2 wire purpose values, never a case-transformed SQL suffix.
-- All entries remain DISABLED until an audited narrow writer exists.
CREATE TABLE auth_proof_private.proof_purposes (
  purpose text PRIMARY KEY CHECK (purpose ~ '^[A-Z][A-Z0-9_]{2,95}$'),
  actor_kind text NOT NULL CHECK (actor_kind IN ('STAFF','ANONYMOUS','OPERATOR')),
  wire_schema_version smallint NOT NULL DEFAULT 1 CHECK (wire_schema_version = 1),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO auth_proof_private.proof_purposes(purpose,actor_kind) VALUES
  ('STAFF_LOGIN_COMMIT','ANONYMOUS'),
  ('STAFF_REFRESH_ROTATE_OR_REPLAY_REVOKE','STAFF'),
  ('STAFF_SESSION_LOGOUT','STAFF'),
  ('MFA_ENROLL_CREATE','STAFF'),
  ('MFA_ENROLL_RESUME','STAFF'),
  ('MFA_ENROLL_CONFIRM','STAFF'),
  ('MFA_TOTP_STEP_UP','STAFF'),
  ('MFA_SELF_RECOVERY_START','STAFF'),
  ('MFA_RECOVERY_CODES_REISSUE','STAFF'),
  ('MFA_ADMIN_ACTIVITY','STAFF'),
  ('STAFF_ROLE_CHANGE','STAFF'),
  ('STAFF_MEMBERSHIP_STATUS_CHANGE','STAFF'),
  ('STAFF_LOCATION_GRANTS_CHANGE','STAFF'),
  ('STAFF_INVITATION_CREATE','STAFF'),
  ('STAFF_INVITATION_RESEND','STAFF'),
  ('STAFF_INVITATION_ACTIVATE','ANONYMOUS'),
  ('LOCATION_LIFECYCLE_CREATE','STAFF'),
  ('LOCATION_LIFECYCLE_ACTIVATE','STAFF'),
  ('LOCATION_LIFECYCLE_STOP_INTAKE','STAFF'),
  ('LOCATION_LIFECYCLE_RESUME_INTAKE','STAFF'),
  ('LOCATION_LIFECYCLE_DEACTIVATE','STAFF'),
  ('LOCATION_LIFECYCLE_CORRECT_CURRENCY','STAFF'),
  ('LOCATION_LIFECYCLE_CORRECT_TIMEZONE','STAFF'),
  ('SETTINGS_COMPANY_SCALAR','STAFF'),
  ('SETTINGS_LOCATION_SCALAR','STAFF'),
  ('SETTINGS_CLEAR_LOCATION_SCALAR','STAFF'),
  ('SETTINGS_COMPANY_OPERATING_HOURS','STAFF'),
  ('SETTINGS_CLEAR_COMPANY_OPERATING_HOURS','STAFF'),
  ('SETTINGS_LOCATION_OPERATING_HOURS','STAFF'),
  ('SETTINGS_CLEAR_LOCATION_OPERATING_HOURS','STAFF'),
  ('BRANDING_SET_COMPANY_DEFAULT','STAFF'),
  ('BRANDING_SET_LOCATION_OVERRIDE','STAFF'),
  ('BRANDING_CLEAR_LOCATION_OVERRIDE','STAFF'),
  ('SETTINGS_LOCATION_SLA_TARGET','STAFF'),
  ('SETTINGS_CLEAR_LOCATION_SLA_TARGET','STAFF'),
  ('SHIFT_PRESENCE_POLICY','STAFF'),
  ('STAFF_PUSH_REGISTER_CONFIRM_SUPERSEDE','STAFF'),
  ('STAFF_PUSH_EXPLICIT_DISABLE','STAFF'),
  ('RESET_ISSUE','STAFF'),
  ('RESET_REDEEM','ANONYMOUS'),
  ('STAFF_SHIFT_FORCE_END','STAFF');

CREATE TABLE auth_proof_private.proof_challenges (
  challenge_id uuid PRIMARY KEY,
  audience text NOT NULL,
  key_id text NOT NULL,
  promotion_epoch bigint NOT NULL CHECK (promotion_epoch > 0),
  purpose text NOT NULL REFERENCES auth_proof_private.proof_purposes(purpose),
  operation_id uuid NOT NULL,
  nonce bytea NOT NULL UNIQUE CHECK (pg_catalog.octet_length(nonce) = 32),
  backend_pid integer NOT NULL CHECK (backend_pid > 0),
  full_xid numeric(20,0) NOT NULL CHECK (
    full_xid >= 0 AND full_xid <= 18446744073709551615
  ),
  actor_kind text NOT NULL CHECK (actor_kind IN ('STAFF','ANONYMOUS','OPERATOR')),
  actor_user_id uuid,
  actor_session_id uuid,
  organization_id uuid,
  membership_id uuid,
  subject_user_id uuid,
  payload_digest bytea NOT NULL CHECK (pg_catalog.octet_length(payload_digest) = 32),
  state_digest bytea NOT NULL CHECK (pg_catalog.octet_length(state_digest) = 32),
  issued_at_ms bigint NOT NULL CHECK (issued_at_ms > 0),
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms = issued_at_ms + 30000),
  consumed_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (audience, purpose, operation_id, backend_pid, full_xid),
  FOREIGN KEY (audience, key_id)
    REFERENCES auth_proof_private.proof_keys(audience, key_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX vap1_challenges_expiration
  ON auth_proof_private.proof_challenges(expires_at_ms)
  WHERE consumed_at IS NULL;

CREATE TABLE auth_proof_private.operation_receipts (
  audience text NOT NULL,
  operation_id uuid NOT NULL,
  purpose text NOT NULL,
  payload_digest bytea NOT NULL CHECK (pg_catalog.octet_length(payload_digest) = 32),
  state_digest bytea NOT NULL CHECK (pg_catalog.octet_length(state_digest) = 32),
  challenge_id uuid NOT NULL UNIQUE
    REFERENCES auth_proof_private.proof_challenges(challenge_id),
  outcome text NOT NULL CHECK (outcome IN ('COMPLETED','REVOKED','LINK_UNAVAILABLE')),
  audit_event_id uuid,
  completed_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (audience, operation_id)
);

CREATE TABLE auth_proof_private.authority_admissions (
  audience text NOT NULL,
  object_kind text NOT NULL CHECK (object_kind IN (
    'USER','ORGANIZATION','ENTITLEMENT','MEMBERSHIP','LOCATION','GRANT',
    'SESSION','REFRESH','FACTOR','RECOVERY_SET','INVITATION',
    'PASSWORD_RESET','PUSH_REGISTRATION'
  )),
  object_key_bytes bytea NOT NULL CHECK (
    (pg_catalog.octet_length(object_key_bytes) = 17
      AND pg_catalog.get_byte(object_key_bytes,0) = 1)
    OR (pg_catalog.octet_length(object_key_bytes) = 49
      AND pg_catalog.get_byte(object_key_bytes,0) = 2)
  ),
  disposition text NOT NULL CHECK (disposition IN ('ADMIT','HOLD','RETIRE')),
  admission_version bigint NOT NULL CHECK (admission_version > 0),
  material_digest bytea NOT NULL CHECK (pg_catalog.octet_length(material_digest) = 32),
  operator_reference text NOT NULL CHECK (pg_catalog.length(operator_reference) BETWEEN 1 AND 256),
  audit_event_id uuid NOT NULL,
  updated_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (audience, object_kind, object_key_bytes)
);

-- A pre-domain limiter reservation must be independently bound to one exact
-- command operation, not inferred from a caller-supplied anti-abuse row UUID.
-- Only a future audited purpose-specific reservation SQL writer may populate.
CREATE TABLE auth_proof_private.limiter_bindings (
  reservation_id uuid PRIMARY KEY
    REFERENCES public.anti_abuse_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  audience text NOT NULL,
  operation_id uuid NOT NULL,
  purpose text NOT NULL REFERENCES auth_proof_private.proof_purposes(purpose),
  scope text NOT NULL,
  key_digest bytea NOT NULL CHECK (pg_catalog.octet_length(key_digest) = 32),
  bound_at timestamptz(6) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (audience,purpose,operation_id,scope)
);

REVOKE ALL ON ALL TABLES IN SCHEMA auth_proof_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA auth_proof_private FROM PUBLIC;
RESET ROLE;
COMMIT;

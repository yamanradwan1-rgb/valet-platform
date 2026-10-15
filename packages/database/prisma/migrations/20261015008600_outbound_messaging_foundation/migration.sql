-- Stage C outbound messaging: additive, disabled by default, never backfill historical visits.
CREATE TABLE outbound_provider_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  purpose text NOT NULL DEFAULT 'INITIAL_GUEST_ACCESS' CHECK (purpose = 'INITIAL_GUEST_ACCESS'),
  provider text NOT NULL DEFAULT 'META_CLOUD' CHECK (provider = 'META_CLOUD'),
  environment text NOT NULL CHECK (environment IN ('test','production')),
  waba_id text NOT NULL CHECK (length(waba_id) BETWEEN 1 AND 128),
  phone_number_id text NOT NULL CHECK (length(phone_number_id) BETWEEN 1 AND 128),
  config_alias text NOT NULL CHECK (length(config_alias) BETWEEN 1 AND 128),
  enabled boolean NOT NULL DEFAULT false,
  provider_verified_at timestamptz(3),
  provider_evidence_reference text CHECK (length(provider_evidence_reference) BETWEEN 8 AND 160),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(organization_id,id),
  UNIQUE(environment,provider,phone_number_id),
  CHECK ((provider_verified_at IS NULL) = (provider_evidence_reference IS NULL))
);
CREATE UNIQUE INDEX outbound_binding_one_enabled_idx
  ON outbound_provider_bindings(organization_id,environment,purpose) WHERE enabled;

CREATE TABLE outbound_messaging_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id uuid,
  purpose text NOT NULL DEFAULT 'INITIAL_GUEST_ACCESS' CHECK (purpose = 'INITIAL_GUEST_ACCESS'),
  enabled boolean,
  language text CHECK (language IN ('ar','en')),
  provider_binding_id uuid,
  template_catalog_version text CHECK (length(template_catalog_version) BETWEEN 1 AND 128),
  policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,provider_binding_id) REFERENCES outbound_provider_bindings(organization_id,id) ON DELETE RESTRICT,
  CHECK (location_id IS NOT NULL OR enabled IS NOT NULL)
);
CREATE UNIQUE INDEX outbound_policy_company_idx ON outbound_messaging_policies(organization_id,purpose) WHERE location_id IS NULL;
CREATE UNIQUE INDEX outbound_policy_location_idx ON outbound_messaging_policies(organization_id,location_id,purpose) WHERE location_id IS NOT NULL;

CREATE TABLE outbound_messaging_control (
  environment text PRIMARY KEY CHECK (environment IN ('test','production')),
  issue_enabled boolean NOT NULL DEFAULT false,
  send_enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO outbound_messaging_control(environment) VALUES ('test'),('production');

CREATE TABLE outbound_messaging_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  recipient_digest text NOT NULL CHECK (recipient_digest ~ '^hmac:v[0-9]+:[A-Za-z0-9_-]{32,128}$'),
  purpose text NOT NULL DEFAULT 'INITIAL_GUEST_ACCESS' CHECK (purpose = 'INITIAL_GUEST_ACCESS'),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 160),
  collected_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3),
  withdrawn_at timestamptz(3),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,recipient_digest,purpose),
  CHECK (expires_at IS NULL OR expires_at > collected_at),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= collected_at)
);
CREATE TABLE outbound_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  action text NOT NULL CHECK (action IN ('GRANT','WITHDRAW')),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 160),
  occurred_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(organization_id,permission_id) REFERENCES outbound_messaging_permissions(organization_id,id) ON DELETE RESTRICT,
  UNIQUE(organization_id,permission_id,revision)
);

CREATE TABLE outbound_message_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  valet_session_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'INITIAL_GUEST_ACCESS' CHECK (purpose = 'INITIAL_GUEST_ACCESS'),
  credential_generation integer NOT NULL CHECK (credential_generation > 0),
  recipient_digest text NOT NULL CHECK (recipient_digest ~ '^hmac:v[0-9]+:[A-Za-z0-9_-]{32,128}$'),
  permission_id uuid NOT NULL,
  permission_revision integer NOT NULL CHECK (permission_revision > 0),
  policy_id uuid NOT NULL,
  policy_revision integer NOT NULL CHECK (policy_revision > 0),
  company_policy_revision integer NOT NULL CHECK (company_policy_revision > 0),
  provider_binding_id uuid NOT NULL,
  binding_revision integer NOT NULL CHECK (binding_revision > 0),
  template_catalog_version text NOT NULL CHECK (length(template_catalog_version) BETWEEN 1 AND 128),
  language text NOT NULL CHECK (language IN ('ar','en')),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz(3) NOT NULL,
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,valet_session_id,purpose),
  FOREIGN KEY(organization_id,location_id) REFERENCES locations(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,location_id,valet_session_id) REFERENCES valet_sessions(organization_id,location_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,permission_id) REFERENCES outbound_messaging_permissions(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,policy_id) REFERENCES outbound_messaging_policies(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,provider_binding_id) REFERENCES outbound_provider_bindings(organization_id,id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes')
);
CREATE INDEX outbound_intent_expiry_idx ON outbound_message_intents(expires_at,id);

CREATE TABLE outbound_message_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'WHATSAPP' CHECK (channel = 'WHATSAPP'),
  provider text NOT NULL DEFAULT 'META_CLOUD' CHECK (provider = 'META_CLOUD'),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','LEASED','DISPATCHING','ACCEPTED','UNKNOWN','RETRY_WAIT','PERMANENT_FAILURE','SUPPRESSED','EXPIRED')),
  next_attempt_at timestamptz(3),
  lease_token uuid UNIQUE,
  lease_expires_at timestamptz(3),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 4),
  max_attempts integer NOT NULL DEFAULT 4 CHECK (max_attempts BETWEEN 1 AND 4),
  accepted_at timestamptz(3),
  sent_at timestamptz(3),
  delivered_at timestamptz(3),
  read_at timestamptz(3),
  failed_at timestamptz(3),
  terminal_reason text CHECK (terminal_reason IS NULL OR terminal_reason IN ('EXPIRED','REVOKED','CONSENT','SCOPE','POLICY','CONFIGURATION','PROVIDER','UNKNOWN','ATTEMPTS','PERMANENT')),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,intent_id,channel),
  FOREIGN KEY(organization_id,intent_id) REFERENCES outbound_message_intents(organization_id,id) ON DELETE RESTRICT,
  CHECK (attempt_count <= max_attempts),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((state IN ('LEASED','DISPATCHING')) = (lease_token IS NOT NULL)),
  CHECK (state NOT IN ('PENDING','RETRY_WAIT') OR next_attempt_at IS NOT NULL)
);
CREATE INDEX outbound_due_idx ON outbound_message_deliveries(next_attempt_at,created_at,id) WHERE state IN ('PENDING','RETRY_WAIT');
CREATE INDEX outbound_lease_idx ON outbound_message_deliveries(lease_expires_at,id) WHERE state IN ('LEASED','DISPATCHING');

CREATE TABLE outbound_message_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  provider_binding_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 4),
  callback_handle uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'DISPATCHING' CHECK (state IN ('DISPATCHING','ACCEPTED','NOT_SENT','UNKNOWN','DEFINITIVE_FAILURE','PERMANENT_FAILURE')),
  dispatch_started_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  transport_started_at timestamptz(3),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) BETWEEN 1 AND 255),
  safe_code text CHECK (safe_code IS NULL OR safe_code IN ('REJECTED','RATE_LIMIT','TIMEOUT','NETWORK','CONFIGURATION','INVALID_RECIPIENT','INVALID_TEMPLATE','UNKNOWN','NOT_SENT')),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,delivery_id,ordinal),
  UNIQUE(organization_id,delivery_id,id),
  FOREIGN KEY(organization_id,delivery_id) REFERENCES outbound_message_deliveries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,provider_binding_id) REFERENCES outbound_provider_bindings(organization_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX outbound_attempt_provider_message_key ON outbound_message_attempts(provider_binding_id,provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE outbound_message_envelopes (
  intent_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 384 AND 1024),
  aad_label bytea NOT NULL CHECK (octet_length(aad_label) BETWEEN 32 AND 2048),
  key_version text NOT NULL CHECK (length(key_version) BETWEEN 1 AND 64),
  aad_version integer NOT NULL DEFAULT 1 CHECK (aad_version = 1),
  algorithm text NOT NULL DEFAULT 'RSA-OAEP-SHA256' CHECK (algorithm = 'RSA-OAEP-SHA256'),
  purge_at timestamptz(3) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(organization_id,intent_id) REFERENCES outbound_message_intents(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX outbound_envelope_purge_idx ON outbound_message_envelopes(purge_at,intent_id);

CREATE TABLE outbound_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  provider_binding_id uuid NOT NULL,
  dedupe_digest text NOT NULL CHECK (dedupe_digest ~ '^[a-f0-9]{64}$'),
  event_kind text NOT NULL CHECK (event_kind IN ('SENT','DELIVERED','READ','FAILED')),
  provider_occurred_at timestamptz(3),
  safe_code text CHECK (safe_code IS NULL OR safe_code IN ('PROVIDER','RECIPIENT','UNKNOWN')),
  received_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(organization_id,delivery_id) REFERENCES outbound_message_deliveries(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,attempt_id) REFERENCES outbound_message_attempts(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,delivery_id,attempt_id) REFERENCES outbound_message_attempts(organization_id,delivery_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(organization_id,provider_binding_id) REFERENCES outbound_provider_bindings(organization_id,id) ON DELETE RESTRICT,
  UNIQUE(provider_binding_id,dedupe_digest)
);

CREATE TABLE outbound_message_budgets (
  provider_binding_id uuid PRIMARY KEY REFERENCES outbound_provider_bindings(id) ON DELETE RESTRICT,
  capacity numeric(10,3) NOT NULL DEFAULT 1 CHECK (capacity > 0 AND capacity <= 1000),
  tokens numeric(10,3) NOT NULL DEFAULT 1 CHECK (tokens >= 0 AND tokens <= 1000),
  refill_per_second numeric(10,3) NOT NULL DEFAULT 1 CHECK (refill_per_second > 0 AND refill_per_second <= 1000),
  last_refill_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (tokens <= capacity)
);
CREATE TABLE outbound_recipient_budgets (
  provider_binding_id uuid NOT NULL REFERENCES outbound_provider_bindings(id) ON DELETE RESTRICT,
  recipient_digest text NOT NULL CHECK (recipient_digest ~ '^hmac:v[0-9]+:[A-Za-z0-9_-]{32,128}$'),
  next_permitted_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  PRIMARY KEY(provider_binding_id,recipient_digest),
  CHECK (expires_at > next_permitted_at)
);
CREATE INDEX outbound_recipient_budget_expiry_idx ON outbound_recipient_budgets(expires_at);

-- Restrict only the newly introduced feature; preserve unrelated baseline ACL.
REVOKE ALL ON TABLE outbound_provider_bindings,outbound_messaging_policies,
  outbound_messaging_control,outbound_messaging_permissions,outbound_permission_events,
  outbound_message_intents,outbound_message_deliveries,outbound_message_attempts,
  outbound_message_envelopes,outbound_message_events,outbound_message_budgets,
  outbound_recipient_budgets FROM PUBLIC;

-- Immutable capture columns; only the explicit delivery/permission/attempt evidence is mutable.
CREATE FUNCTION outbound_guard_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog,public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'OUTBOUND_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF row_to_json(OLD)::jsonb IS DISTINCT FROM row_to_json(NEW)::jsonb THEN
    RAISE EXCEPTION 'OUTBOUND_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_intent_immutable BEFORE UPDATE OR DELETE ON outbound_message_intents FOR EACH ROW EXECUTE FUNCTION outbound_guard_immutable();
CREATE TRIGGER outbound_event_immutable BEFORE UPDATE OR DELETE ON outbound_message_events FOR EACH ROW EXECUTE FUNCTION outbound_guard_immutable();
CREATE TRIGGER outbound_permission_event_immutable BEFORE UPDATE OR DELETE ON outbound_permission_events FOR EACH ROW EXECUTE FUNCTION outbound_guard_immutable();

CREATE FUNCTION outbound_guard_delivery() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog,public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'OUTBOUND_DELIVERY_FENCE' USING ERRCODE='23514'; END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.intent_id <> OLD.intent_id
     OR NEW.channel <> OLD.channel OR NEW.provider <> OLD.provider
    OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
     OR (OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at)
     OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
     OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
     OR (OLD.failed_at IS NOT NULL AND NEW.failed_at IS DISTINCT FROM OLD.failed_at)
  THEN RAISE EXCEPTION 'OUTBOUND_DELIVERY_FENCE' USING ERRCODE='23514'; END IF;
  IF (OLD.state IN ('DISPATCHING','UNKNOWN','ACCEPTED','PERMANENT_FAILURE','SUPPRESSED','EXPIRED')
     AND NEW.state IN ('PENDING','LEASED','RETRY_WAIT'))
     OR (OLD.state IN ('UNKNOWN','ACCEPTED','PERMANENT_FAILURE','SUPPRESSED','EXPIRED')
       AND NEW.state<>OLD.state)
  THEN RAISE EXCEPTION 'OUTBOUND_NO_REQUEUE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_delivery_fence BEFORE UPDATE OR DELETE ON outbound_message_deliveries FOR EACH ROW EXECUTE FUNCTION outbound_guard_delivery();

CREATE FUNCTION outbound_guard_attempt() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog,public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'OUTBOUND_ATTEMPT_FENCE' USING ERRCODE='23514'; END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.delivery_id <> OLD.delivery_id
    OR NEW.provider_binding_id <> OLD.provider_binding_id OR NEW.ordinal <> OLD.ordinal
    OR NEW.callback_handle <> OLD.callback_handle OR NEW.dispatch_started_at <> OLD.dispatch_started_at
    OR (OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id)
    OR (OLD.state <> 'DISPATCHING' AND NEW.state <> OLD.state)
  THEN RAISE EXCEPTION 'OUTBOUND_ATTEMPT_FENCE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_attempt_fence BEFORE UPDATE OR DELETE ON outbound_message_attempts FOR EACH ROW EXECUTE FUNCTION outbound_guard_attempt();

CREATE FUNCTION outbound_guard_configuration() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OUTBOUND_CONFIG_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.purpose<>OLD.purpose
    OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
  THEN RAISE EXCEPTION 'OUTBOUND_CONFIG_SCOPE' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='outbound_provider_bindings' THEN
    IF NEW.provider<>OLD.provider OR NEW.environment<>OLD.environment
      OR NEW.waba_id<>OLD.waba_id OR NEW.phone_number_id<>OLD.phone_number_id
    THEN RAISE EXCEPTION 'OUTBOUND_BINDING_IMMUTABLE' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.location_id IS DISTINCT FROM OLD.location_id
    THEN RAISE EXCEPTION 'OUTBOUND_POLICY_SCOPE' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_binding_scope BEFORE UPDATE OR DELETE ON outbound_provider_bindings
  FOR EACH ROW EXECUTE FUNCTION outbound_guard_configuration();
CREATE TRIGGER outbound_policy_scope BEFORE UPDATE OR DELETE ON outbound_messaging_policies
  FOR EACH ROW EXECUTE FUNCTION outbound_guard_configuration();

REVOKE ALL ON FUNCTION outbound_guard_immutable(),outbound_guard_delivery(),outbound_guard_attempt(),outbound_guard_configuration() FROM PUBLIC;

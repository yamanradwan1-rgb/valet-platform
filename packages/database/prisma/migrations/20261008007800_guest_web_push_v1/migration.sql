-- DEC-101 / T5-PUSH: dedicated Guest Web Push persistence and authority functions.

CREATE TYPE public.guest_push_locale AS ENUM ('en', 'ar');
CREATE TYPE public.guest_push_registration_state AS ENUM (
  'ACTIVE', 'DISABLED', 'PROVIDER_INVALID', 'SUPERSEDED'
);
CREATE TYPE public.guest_push_kind AS ENUM ('GUEST_VEHICLE_READY');
CREATE TYPE public.guest_push_delivery_state AS ENUM (
  'PENDING', 'LEASED', 'RETRY_WAIT', 'PROVIDER_ACCEPTED',
  'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED'
);
CREATE TYPE public.guest_push_provider_result_class AS ENUM (
  'ACCEPTED', 'TRANSIENT', 'RATE_LIMITED', 'INVALID_ENDPOINT',
  'PERMANENT', 'CONFIGURATION', 'UNKNOWN'
);

ALTER TABLE public.guest_browser_sessions
ADD CONSTRAINT guest_browser_sessions_id_session_generation_key
UNIQUE (id, valet_session_id, credential_generation);

CREATE TABLE public.guest_push_registrations (
  id UUID NOT NULL,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  valet_session_id UUID NOT NULL,
  credential_generation INTEGER NOT NULL,
  guest_browser_session_id UUID NOT NULL,
  endpoint TEXT,
  endpoint_hash TEXT NOT NULL,
  p256dh TEXT,
  auth_secret TEXT,
  locale public.guest_push_locale NOT NULL,
  state public.guest_push_registration_state NOT NULL DEFAULT 'ACTIVE',
  last_confirmed_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminal_at TIMESTAMPTZ(3),
  terminal_reason_class TEXT,
  superseded_by_registration_id UUID,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT guest_push_registrations_pkey PRIMARY KEY (id),
  CONSTRAINT guest_push_registrations_generation_check
    CHECK (credential_generation >= 0),
  CONSTRAINT guest_push_registrations_endpoint_hash_check
    CHECK (endpoint_hash ~ '^guest-push-endpoint-sha256:v1:[0-9a-f]{64}$'),
  CONSTRAINT guest_push_registrations_time_check CHECK (
    last_confirmed_at >= created_at
    AND (terminal_at IS NULL OR terminal_at >= created_at)
  ),
  CONSTRAINT guest_push_registrations_state_shape_check CHECK (
    (state = 'ACTIVE'
      AND endpoint IS NOT NULL AND endpoint <> ''
      AND p256dh IS NOT NULL AND p256dh <> ''
      AND auth_secret IS NOT NULL AND auth_secret <> ''
      AND terminal_at IS NULL
      AND terminal_reason_class IS NULL
      AND superseded_by_registration_id IS NULL)
    OR
    (state IN ('DISABLED', 'PROVIDER_INVALID')
      AND endpoint IS NULL AND p256dh IS NULL AND auth_secret IS NULL
      AND terminal_at IS NOT NULL
      AND terminal_reason_class IS NOT NULL
      AND btrim(terminal_reason_class) <> ''
      AND superseded_by_registration_id IS NULL)
    OR
    (state = 'SUPERSEDED'
      AND endpoint IS NULL AND p256dh IS NULL AND auth_secret IS NULL
      AND terminal_at IS NOT NULL
      AND terminal_reason_class IS NOT NULL
      AND btrim(terminal_reason_class) <> ''
      AND superseded_by_registration_id IS NOT NULL
      AND superseded_by_registration_id <> id)
  )
);

CREATE UNIQUE INDEX guest_push_registrations_organization_id_id_key
ON public.guest_push_registrations (organization_id, id);
CREATE UNIQUE INDEX guest_push_registrations_active_browser_session_key
ON public.guest_push_registrations (guest_browser_session_id)
WHERE state = 'ACTIVE';
CREATE UNIQUE INDEX guest_push_registrations_active_endpoint_hash_key
ON public.guest_push_registrations (endpoint_hash)
WHERE state = 'ACTIVE';
CREATE INDEX guest_push_registrations_browser_session_state_idx
ON public.guest_push_registrations (guest_browser_session_id, state);
CREATE INDEX guest_push_registrations_session_generation_state_idx
ON public.guest_push_registrations (valet_session_id, credential_generation, state);
CREATE INDEX guest_push_registrations_superseded_by_idx
ON public.guest_push_registrations (superseded_by_registration_id);
CREATE INDEX guest_push_registrations_terminal_at_idx
ON public.guest_push_registrations (terminal_at, id);

ALTER TABLE public.guest_push_registrations
ADD CONSTRAINT guest_push_registrations_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_registrations
ADD CONSTRAINT guest_push_registrations_org_location_id_fkey
FOREIGN KEY (organization_id, location_id)
REFERENCES public.locations(organization_id, id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_registrations
ADD CONSTRAINT guest_push_registrations_scope_valet_session_id_fkey
FOREIGN KEY (organization_id, location_id, valet_session_id)
REFERENCES public.valet_sessions(organization_id, location_id, id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_registrations
ADD CONSTRAINT guest_push_registrations_browser_session_scope_fkey
FOREIGN KEY (guest_browser_session_id, valet_session_id, credential_generation)
REFERENCES public.guest_browser_sessions(id, valet_session_id, credential_generation)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_registrations
ADD CONSTRAINT guest_push_registrations_superseded_by_fkey
FOREIGN KEY (superseded_by_registration_id)
REFERENCES public.guest_push_registrations(id)
ON DELETE RESTRICT ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.guest_push_intents (
  id UUID NOT NULL,
  organization_id UUID NOT NULL,
  location_id UUID NOT NULL,
  valet_session_id UUID NOT NULL,
  kind public.guest_push_kind NOT NULL,
  ready_at TIMESTAMPTZ(3) NOT NULL,
  policy_version INTEGER NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT guest_push_intents_pkey PRIMARY KEY (id),
  CONSTRAINT guest_push_intents_policy_version_check CHECK (policy_version > 0),
  CONSTRAINT guest_push_intents_expiry_check CHECK (expires_at > ready_at),
  CONSTRAINT guest_push_intents_created_ready_check CHECK (created_at >= ready_at)
);

CREATE UNIQUE INDEX guest_push_intents_organization_id_id_key
ON public.guest_push_intents (organization_id, id);
CREATE UNIQUE INDEX guest_push_intents_kind_session_ready_at_key
ON public.guest_push_intents (kind, valet_session_id, ready_at);
CREATE INDEX guest_push_intents_location_created_at_idx
ON public.guest_push_intents (location_id, created_at, id);
CREATE INDEX guest_push_intents_expires_at_idx
ON public.guest_push_intents (expires_at, id);

ALTER TABLE public.guest_push_intents
ADD CONSTRAINT guest_push_intents_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_intents
ADD CONSTRAINT guest_push_intents_org_location_id_fkey
FOREIGN KEY (organization_id, location_id)
REFERENCES public.locations(organization_id, id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_intents
ADD CONSTRAINT guest_push_intents_scope_valet_session_id_fkey
FOREIGN KEY (organization_id, location_id, valet_session_id)
REFERENCES public.valet_sessions(organization_id, location_id, id)
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE public.guest_push_deliveries (
  id UUID NOT NULL,
  organization_id UUID NOT NULL,
  intent_id UUID NOT NULL,
  registration_id UUID NOT NULL,
  state public.guest_push_delivery_state NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  next_attempt_at TIMESTAMPTZ(3),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ(3),
  provider_result_class public.guest_push_provider_result_class,
  provider_reference TEXT,
  provider_accepted_at TIMESTAMPTZ(3),
  terminal_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT guest_push_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT guest_push_deliveries_attempts_check CHECK (
    max_attempts > 0 AND attempt_count >= 0 AND attempt_count <= max_attempts
  ),
  CONSTRAINT guest_push_deliveries_lease_shape_check CHECK (
    (state = 'LEASED' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (state <> 'LEASED' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT guest_push_deliveries_terminal_shape_check CHECK (
    (state IN ('PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED')
      AND terminal_at IS NOT NULL)
    OR
    (state IN ('PENDING', 'LEASED', 'RETRY_WAIT') AND terminal_at IS NULL)
  ),
  CONSTRAINT guest_push_deliveries_provider_acceptance_check CHECK (
    (state = 'PROVIDER_ACCEPTED'
      AND provider_result_class = 'ACCEPTED'
      AND provider_accepted_at IS NOT NULL)
    OR
    (state <> 'PROVIDER_ACCEPTED'
      AND provider_accepted_at IS NULL
      AND provider_result_class IS DISTINCT FROM 'ACCEPTED')
  ),
  CONSTRAINT guest_push_deliveries_scheduling_check CHECK (
    (state = 'PENDING'
      AND attempt_count = 0
      AND next_attempt_at IS NOT NULL
      AND provider_result_class IS NULL)
    OR
    (state = 'LEASED'
      AND attempt_count > 0
      AND next_attempt_at IS NULL
      AND provider_result_class IS NULL)
    OR
    (state = 'RETRY_WAIT'
      AND attempt_count > 0
      AND attempt_count < max_attempts
      AND next_attempt_at IS NOT NULL
      AND provider_result_class IN ('TRANSIENT', 'RATE_LIMITED', 'CONFIGURATION', 'UNKNOWN'))
    OR
    (state IN ('PROVIDER_ACCEPTED', 'SUPPRESSED', 'EXPIRED')
      AND next_attempt_at IS NULL)
    OR
    (state = 'PERMANENT_FAILURE'
      AND next_attempt_at IS NULL
      AND provider_result_class IS NOT NULL)
  ),
  CONSTRAINT guest_push_deliveries_time_check CHECK (
    (provider_accepted_at IS NULL OR provider_accepted_at >= created_at)
    AND (terminal_at IS NULL OR terminal_at >= created_at)
  )
);

CREATE UNIQUE INDEX guest_push_deliveries_intent_registration_key
ON public.guest_push_deliveries (intent_id, registration_id);
CREATE UNIQUE INDEX guest_push_deliveries_lease_token_key
ON public.guest_push_deliveries (lease_token);
CREATE INDEX guest_push_deliveries_due_idx
ON public.guest_push_deliveries (state, next_attempt_at, created_at, id);
CREATE INDEX guest_push_deliveries_lease_expiry_idx
ON public.guest_push_deliveries (lease_expires_at, id);
CREATE INDEX guest_push_deliveries_registration_state_idx
ON public.guest_push_deliveries (registration_id, state);

ALTER TABLE public.guest_push_deliveries
ADD CONSTRAINT guest_push_deliveries_organization_id_fkey
FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_deliveries
ADD CONSTRAINT guest_push_deliveries_org_intent_id_fkey
FOREIGN KEY (organization_id, intent_id)
REFERENCES public.guest_push_intents(organization_id, id)
ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.guest_push_deliveries
ADD CONSTRAINT guest_push_deliveries_org_registration_id_fkey
FOREIGN KEY (organization_id, registration_id)
REFERENCES public.guest_push_registrations(organization_id, id)
ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public.guest_push_registration_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'ACTIVE' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Guest push registrations must start ACTIVE.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Terminal Guest push registrations are immutable.';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.valet_session_id IS DISTINCT FROM OLD.valet_session_id
     OR NEW.credential_generation IS DISTINCT FROM OLD.credential_generation
     OR NEW.guest_browser_session_id IS DISTINCT FROM OLD.guest_browser_session_id
     OR NEW.endpoint_hash IS DISTINCT FROM OLD.endpoint_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Guest push registration identity is immutable.';
  END IF;
  IF NEW.state = 'ACTIVE' AND (
       NEW.endpoint IS DISTINCT FROM OLD.endpoint
       OR NEW.p256dh IS DISTINCT FROM OLD.p256dh
       OR NEW.auth_secret IS DISTINCT FROM OLD.auth_secret
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Active Guest push transport identity is immutable.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER guest_push_registration_guard_trigger
BEFORE INSERT OR UPDATE ON public.guest_push_registrations
FOR EACH ROW EXECUTE FUNCTION public.guest_push_registration_guard();

CREATE FUNCTION public.guest_push_intent_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'Guest push intents are immutable.';
END;
$function$;

CREATE TRIGGER guest_push_intent_immutable_guard_trigger
BEFORE UPDATE ON public.guest_push_intents
FOR EACH ROW EXECUTE FUNCTION public.guest_push_intent_immutable_guard();

CREATE FUNCTION public.guest_push_delivery_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  transition_allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'PENDING' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Guest push deliveries must start PENDING.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.intent_id IS DISTINCT FROM OLD.intent_id
     OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
     OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Guest push delivery identity is immutable.';
  END IF;
  transition_allowed :=
    (OLD.state = 'PENDING' AND NEW.state IN (
      'LEASED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED'
    ))
    OR (OLD.state = 'RETRY_WAIT' AND NEW.state IN (
      'LEASED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED'
    ))
    OR (OLD.state = 'LEASED' AND NEW.state IN (
      'LEASED', 'PROVIDER_ACCEPTED', 'RETRY_WAIT', 'SUPPRESSED',
      'PERMANENT_FAILURE', 'EXPIRED'
    ));
  IF NOT transition_allowed THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Invalid Guest push delivery transition.';
  END IF;
  IF NEW.state = 'LEASED' THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1
       OR NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token
       OR NEW.lease_expires_at <= transaction_timestamp()
       OR (OLD.state = 'LEASED' AND OLD.lease_expires_at > transaction_timestamp()) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Invalid Guest push delivery claim.';
    END IF;
  ELSIF NEW.attempt_count <> OLD.attempt_count THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Guest push attempt count changes only at claim.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER guest_push_delivery_guard_trigger
BEFORE INSERT OR UPDATE ON public.guest_push_deliveries
FOR EACH ROW EXECUTE FUNCTION public.guest_push_delivery_guard();

CREATE FUNCTION public.guest_push_register_v1(
  p_browser_token TEXT,
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_locale TEXT
)
RETURNS TABLE (
  registration_state TEXT,
  registration_locale TEXT,
  last_confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_browser_id UUID;
  v_endpoint_hash TEXT;
  v_generation INTEGER;
  v_location_id UUID;
  v_lock_a BIGINT;
  v_lock_b BIGINT;
  v_new_id UUID;
  v_now TIMESTAMPTZ;
  v_organization_id UUID;
  v_same_id UUID;
  v_session_id UUID;
BEGIN
  IF p_browser_token IS NULL OR p_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$'
     OR p_endpoint IS NULL OR length(p_endpoint) > 4096
     OR NOT (
       p_endpoint ~ '^https://fcm\.googleapis\.com(?::443)?/[^#[:space:]]+$'
       OR p_endpoint ~ '^https://[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.push\.apple\.com(?::443)?/[^#[:space:]]+$'
     )
     OR p_p256dh IS NULL OR p_p256dh !~ '^[A-Za-z0-9_-]{80,128}={0,2}$'
     OR p_auth IS NULL OR p_auth !~ '^[A-Za-z0-9_-]{16,64}={0,2}$'
     OR p_locale NOT IN ('en', 'ar') THEN
    RETURN;
  END IF;

  SELECT resolved.valet_session_id, resolved.credential_generation
    INTO v_session_id, v_generation
    FROM public.guest_browser_resolve(p_browser_token, FALSE) AS resolved
   WHERE resolved.result_code = 'OK' AND resolved.authority_scope = 'ACTIVE';
  IF NOT FOUND THEN RETURN; END IF;

  SELECT browser.id INTO v_browser_id
    FROM public.guest_browser_sessions AS browser
   WHERE browser.token_hash = public.guest_browser_hash_secret(p_browser_token)
     AND browser.valet_session_id = v_session_id
     AND browser.credential_generation = v_generation
     AND browser.revoked_at IS NULL
   FOR UPDATE OF browser;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT session.organization_id, session.location_id
    INTO v_organization_id, v_location_id
    FROM public.valet_sessions AS session
    INNER JOIN public.organizations AS organization
      ON organization.id = session.organization_id
     AND organization.status = 'ACTIVE'
    INNER JOIN public.locations AS location
      ON location.organization_id = session.organization_id
     AND location.id = session.location_id
     AND location.status = 'ACTIVE'
   WHERE session.id = v_session_id
     AND session.customer_access_generation = v_generation
     AND session.customer_access_revoked_at IS NULL
     AND session.state NOT IN ('COMPLETED', 'CANCELLED')
     AND COALESCE(
       location.guest_vehicle_ready_notification_enabled_override,
       organization.guest_vehicle_ready_notification_enabled
     );
  IF NOT FOUND THEN RETURN; END IF;

  v_endpoint_hash := 'guest-push-endpoint-sha256:v1:' ||
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_endpoint, 'UTF8')),
      'hex'
    );
  v_lock_a := hashtextextended('guest-push-browser:' || v_browser_id::text, 0);
  v_lock_b := hashtextextended('guest-push-endpoint:' || v_endpoint_hash, 0);
  IF v_lock_a <= v_lock_b THEN
    PERFORM pg_advisory_xact_lock(v_lock_a);
    IF v_lock_b <> v_lock_a THEN PERFORM pg_advisory_xact_lock(v_lock_b); END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(v_lock_b);
    PERFORM pg_advisory_xact_lock(v_lock_a);
  END IF;

  PERFORM registration.id
    FROM public.guest_push_registrations AS registration
   WHERE registration.state = 'ACTIVE'
     AND (registration.guest_browser_session_id = v_browser_id
       OR registration.endpoint_hash = v_endpoint_hash)
   ORDER BY registration.id
   FOR UPDATE OF registration;

  SELECT registration.id INTO v_same_id
    FROM public.guest_push_registrations AS registration
   WHERE registration.state = 'ACTIVE'
     AND registration.guest_browser_session_id = v_browser_id
     AND registration.endpoint_hash = v_endpoint_hash
     AND registration.endpoint = p_endpoint
     AND registration.p256dh = p_p256dh
     AND registration.auth_secret = p_auth;
  v_now := clock_timestamp();
  IF v_same_id IS NOT NULL THEN
    UPDATE public.guest_push_registrations
       SET locale = p_locale::public.guest_push_locale,
           last_confirmed_at = v_now,
           updated_at = v_now
     WHERE id = v_same_id;
    RETURN QUERY SELECT 'ACTIVE'::TEXT, p_locale, v_now;
    RETURN;
  END IF;

  v_new_id := gen_random_uuid();
  UPDATE public.guest_push_registrations
     SET endpoint = NULL,
         p256dh = NULL,
         auth_secret = NULL,
         state = 'SUPERSEDED',
         terminal_at = v_now,
         terminal_reason_class = 'RECONCILED',
         superseded_by_registration_id = v_new_id,
         updated_at = v_now
   WHERE state = 'ACTIVE'
     AND (guest_browser_session_id = v_browser_id OR endpoint_hash = v_endpoint_hash);

  INSERT INTO public.guest_push_registrations (
    id, organization_id, location_id, valet_session_id,
    credential_generation, guest_browser_session_id,
    endpoint, endpoint_hash, p256dh, auth_secret, locale, state,
    last_confirmed_at, created_at, updated_at
  ) VALUES (
    v_new_id, v_organization_id, v_location_id, v_session_id,
    v_generation, v_browser_id,
    p_endpoint, v_endpoint_hash, p_p256dh, p_auth,
    p_locale::public.guest_push_locale, 'ACTIVE',
    v_now, v_now, v_now
  );
  RETURN QUERY SELECT 'ACTIVE'::TEXT, p_locale, v_now;
END;
$function$;

CREATE FUNCTION public.cleanup_guest_push_v1()
RETURNS TABLE (
  deleted_deliveries INTEGER,
  deleted_intents INTEGER,
  deleted_registrations INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  delivery_count INTEGER := 0;
  intent_count INTEGER := 0;
  registration_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT delivery.id
      FROM public.guest_push_deliveries AS delivery
     WHERE delivery.state IN (
       'PROVIDER_ACCEPTED', 'SUPPRESSED', 'PERMANENT_FAILURE', 'EXPIRED'
     )
       AND delivery.terminal_at < clock_timestamp() - interval '7 days'
     ORDER BY delivery.terminal_at, delivery.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1000
  )
  DELETE FROM public.guest_push_deliveries AS delivery
   USING candidates
   WHERE delivery.id = candidates.id;
  GET DIAGNOSTICS delivery_count = ROW_COUNT;

  WITH candidates AS (
    SELECT intent.id
      FROM public.guest_push_intents AS intent
     WHERE intent.created_at < clock_timestamp() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.guest_push_deliveries AS delivery
          WHERE delivery.intent_id = intent.id
       )
     ORDER BY intent.created_at, intent.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1000
  )
  DELETE FROM public.guest_push_intents AS intent
   USING candidates
   WHERE intent.id = candidates.id;
  GET DIAGNOSTICS intent_count = ROW_COUNT;

  WITH candidates AS (
    SELECT registration.id
      FROM public.guest_push_registrations AS registration
     WHERE registration.state IN ('DISABLED', 'PROVIDER_INVALID', 'SUPERSEDED')
       AND registration.endpoint IS NULL
       AND registration.p256dh IS NULL
       AND registration.auth_secret IS NULL
       AND registration.terminal_at < clock_timestamp() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.guest_push_deliveries AS delivery
          WHERE delivery.registration_id = registration.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.guest_push_registrations AS predecessor
          WHERE predecessor.superseded_by_registration_id = registration.id
       )
     ORDER BY registration.terminal_at, registration.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1000
  )
  DELETE FROM public.guest_push_registrations AS registration
   USING candidates
   WHERE registration.id = candidates.id;
  GET DIAGNOSTICS registration_count = ROW_COUNT;

  RETURN QUERY SELECT delivery_count, intent_count, registration_count;
END;
$function$;

CREATE FUNCTION public.guest_push_ready_intent_v1(
  p_organization_id UUID,
  p_location_id UUID,
  p_valet_session_id UUID,
  p_ready_at TIMESTAMPTZ
)
RETURNS TABLE (intent_id UUID, delivery_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_enabled BOOLEAN;
  v_generation INTEGER;
  v_intent_id UUID;
  v_inserted INTEGER := 0;
  v_revoked_at TIMESTAMPTZ;
BEGIN
  SELECT COALESCE(
           location.guest_vehicle_ready_notification_enabled_override,
           organization.guest_vehicle_ready_notification_enabled
         ),
         session.customer_access_generation,
         session.customer_access_revoked_at
    INTO v_enabled, v_generation, v_revoked_at
    FROM public.valet_sessions AS session
    INNER JOIN public.organizations AS organization
      ON organization.id = session.organization_id
    INNER JOIN public.locations AS location
      ON location.organization_id = session.organization_id
     AND location.id = session.location_id
   WHERE session.id = p_valet_session_id
     AND session.organization_id = p_organization_id
     AND session.location_id = p_location_id
     AND session.state = 'READY'
     AND session.ready_at = p_ready_at
   FOR SHARE OF organization, location;
  IF NOT FOUND OR NOT v_enabled OR v_revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT NULL::UUID, 0;
    RETURN;
  END IF;

  INSERT INTO public.guest_push_intents (
    id, organization_id, location_id, valet_session_id, kind,
    ready_at, policy_version, expires_at, created_at
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_location_id, p_valet_session_id,
    'GUEST_VEHICLE_READY', p_ready_at, 1, p_ready_at + interval '30 minutes', p_ready_at
  )
  ON CONFLICT (kind, valet_session_id, ready_at) DO NOTHING
  RETURNING id INTO v_intent_id;

  IF v_intent_id IS NULL THEN
    SELECT intent.id INTO v_intent_id
      FROM public.guest_push_intents AS intent
     WHERE intent.kind = 'GUEST_VEHICLE_READY'
       AND intent.valet_session_id = p_valet_session_id
       AND intent.ready_at = p_ready_at;
  END IF;

  INSERT INTO public.guest_push_deliveries (
    id, organization_id, intent_id, registration_id, state,
    attempt_count, max_attempts, next_attempt_at, created_at, updated_at
  )
  SELECT gen_random_uuid(), p_organization_id, v_intent_id, registration.id,
         'PENDING', 0, 4, p_ready_at, p_ready_at, p_ready_at
    FROM public.guest_push_registrations AS registration
    INNER JOIN public.guest_browser_sessions AS browser
      ON browser.id = registration.guest_browser_session_id
     AND browser.valet_session_id = registration.valet_session_id
     AND browser.credential_generation = registration.credential_generation
   WHERE registration.organization_id = p_organization_id
     AND registration.location_id = p_location_id
     AND registration.valet_session_id = p_valet_session_id
     AND registration.credential_generation = v_generation
     AND registration.state = 'ACTIVE'
     AND browser.revoked_at IS NULL
   -- Both names are also PL/pgSQL output variables; targetless conflict
   -- handling avoids ambiguous variable/column resolution while the UNIQUE
   -- (intent_id, registration_id) index remains the durable dedupe fence.
   ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN QUERY SELECT v_intent_id, v_inserted;
END;
$function$;

CREATE FUNCTION public.guest_push_resolve_eligible_v1(
  p_delivery_id UUID,
  p_lease_token UUID,
  p_policy_version INTEGER
)
RETURNS TABLE (
  intent_id UUID,
  registration_id UUID,
  endpoint TEXT,
  p256dh TEXT,
  auth_secret TEXT,
  locale TEXT,
  remaining_lifetime_milliseconds INTEGER,
  remaining_lease_milliseconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_organization_id UUID;
BEGIN
  SELECT delivery.organization_id INTO v_organization_id
    FROM public.guest_push_deliveries AS delivery
    WHERE delivery.id = p_delivery_id
      AND delivery.state = 'LEASED'
      AND delivery.lease_token = p_lease_token
      AND delivery.lease_expires_at > clock_timestamp();
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('management-settings-org:' || v_organization_id::text, 0)
  );

  RETURN QUERY
  WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now)
  SELECT intent.id, registration.id,
         registration.endpoint, registration.p256dh,
         registration.auth_secret, registration.locale::text,
         floor(EXTRACT(EPOCH FROM
           (intent.expires_at - clock.now)) * 1000)::integer,
         floor(EXTRACT(EPOCH FROM
           (delivery.lease_expires_at - clock.now)) * 1000)::integer
    FROM public.guest_push_deliveries AS delivery
    CROSS JOIN clock
    INNER JOIN public.guest_push_intents AS intent
      ON intent.id = delivery.intent_id
     AND intent.organization_id = delivery.organization_id
     AND intent.kind = 'GUEST_VEHICLE_READY'
     AND intent.policy_version = p_policy_version
     AND intent.expires_at > clock.now
    INNER JOIN public.guest_push_registrations AS registration
      ON registration.id = delivery.registration_id
     AND registration.organization_id = delivery.organization_id
     AND registration.state = 'ACTIVE'
     AND registration.endpoint IS NOT NULL
     AND registration.p256dh IS NOT NULL
     AND registration.auth_secret IS NOT NULL
    INNER JOIN public.guest_browser_sessions AS browser
      ON browser.id = registration.guest_browser_session_id
     AND browser.valet_session_id = registration.valet_session_id
     AND browser.credential_generation = registration.credential_generation
     AND browser.revoked_at IS NULL
    INNER JOIN public.organizations AS organization
      ON organization.id = intent.organization_id
     AND organization.status = 'ACTIVE'
    INNER JOIN public.locations AS location
      ON location.id = intent.location_id
     AND location.organization_id = intent.organization_id
     AND location.status = 'ACTIVE'
     AND COALESCE(
       location.guest_vehicle_ready_notification_enabled_override,
       organization.guest_vehicle_ready_notification_enabled
     )
    INNER JOIN public.valet_sessions AS session
      ON session.id = intent.valet_session_id
     AND session.organization_id = intent.organization_id
     AND session.location_id = intent.location_id
     AND session.id = registration.valet_session_id
     AND session.customer_access_generation = registration.credential_generation
     AND session.customer_access_revoked_at IS NULL
     AND session.ready_at = intent.ready_at
     AND session.state IN ('READY', 'HANDOFF_PENDING')
    WHERE delivery.id = p_delivery_id
      AND delivery.state = 'LEASED'
      AND delivery.lease_token = p_lease_token
      AND delivery.lease_expires_at > clock.now;
END;
$function$;

CREATE FUNCTION public.guest_push_reconcile_ended_v1(p_limit INTEGER)
RETURNS TABLE (
  terminalized_registrations INTEGER,
  suppressed_deliveries INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  registration_count INTEGER := 0;
  delivery_count INTEGER := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS now),
  candidates AS MATERIALIZED (
    SELECT registration.id
      FROM public.guest_push_registrations AS registration
      INNER JOIN public.guest_browser_sessions AS browser
        ON browser.id = registration.guest_browser_session_id
      INNER JOIN public.valet_sessions AS session
        ON session.id = registration.valet_session_id
     WHERE registration.state = 'ACTIVE'
       AND (
         browser.revoked_at IS NOT NULL
         OR browser.credential_generation <> session.customer_access_generation
         OR registration.credential_generation <> session.customer_access_generation
         OR session.customer_access_revoked_at IS NOT NULL
         OR session.state IN ('COMPLETED', 'CANCELLED')
       )
     ORDER BY registration.updated_at, registration.id
     FOR UPDATE OF registration SKIP LOCKED
     LIMIT p_limit
  ), terminalized AS (
    UPDATE public.guest_push_registrations AS registration
       SET state = 'DISABLED', endpoint = NULL, p256dh = NULL,
           auth_secret = NULL, terminal_at = clock.now,
           terminal_reason_class = 'AUTHORITY_ENDED', updated_at = clock.now
      FROM candidates, clock
     WHERE registration.id = candidates.id
       AND registration.state = 'ACTIVE'
     RETURNING registration.id
  ), suppressed AS (
    UPDATE public.guest_push_deliveries AS delivery
       SET state = 'SUPPRESSED', next_attempt_at = NULL,
           provider_result_class = NULL, provider_reference = NULL,
           terminal_at = clock.now, updated_at = clock.now
      FROM terminalized, clock
     WHERE delivery.registration_id = terminalized.id
       AND delivery.state IN ('PENDING', 'RETRY_WAIT')
     RETURNING delivery.id
  )
  SELECT (SELECT count(*)::integer FROM terminalized),
         (SELECT count(*)::integer FROM suppressed)
    INTO registration_count, delivery_count;

  RETURN QUERY SELECT registration_count, delivery_count;
END;
$function$;

REVOKE ALL ON TABLE public.guest_push_registrations FROM PUBLIC;
REVOKE ALL ON TABLE public.guest_push_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.guest_push_deliveries FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_registration_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_intent_immutable_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_delivery_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_register_v1(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_ready_intent_v1(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_resolve_eligible_v1(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_push_reconcile_ended_v1(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_guest_push_v1() FROM PUBLIC;

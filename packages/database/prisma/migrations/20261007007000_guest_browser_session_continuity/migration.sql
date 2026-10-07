BEGIN;

ALTER TABLE public.valet_sessions
  ADD COLUMN customer_access_generation INTEGER,
  ADD COLUMN customer_access_consumed_at TIMESTAMPTZ(3);

UPDATE public.valet_sessions
SET customer_access_generation = CASE
  WHEN customer_access_token_hash LIKE 'disabled:intake:%' THEN 0
  ELSE 1
END;

ALTER TABLE public.valet_sessions
  ALTER COLUMN customer_access_generation SET NOT NULL,
  ALTER COLUMN customer_access_generation SET DEFAULT 0,
  ADD CONSTRAINT valet_sessions_customer_access_generation_check
    CHECK (customer_access_generation >= 0);

CREATE TABLE public.guest_browser_enrollments (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  enrollment_token_hash TEXT NOT NULL,
  browser_session_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  valet_session_id UUID,
  credential_generation INTEGER,
  exchanged_at TIMESTAMPTZ(3),
  CONSTRAINT guest_browser_enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT guest_browser_enrollments_enrollment_token_hash_key
    UNIQUE (enrollment_token_hash),
  CONSTRAINT guest_browser_enrollments_browser_session_token_hash_key
    UNIQUE (browser_session_token_hash),
  CONSTRAINT guest_browser_enrollments_enrollment_token_hash_shape_check
    CHECK (enrollment_token_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  CONSTRAINT guest_browser_enrollments_browser_session_token_hash_shape_check
    CHECK (browser_session_token_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  CONSTRAINT guest_browser_enrollments_secret_hashes_differ_check
    CHECK (enrollment_token_hash <> browser_session_token_hash),
  CONSTRAINT guest_browser_enrollments_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT guest_browser_enrollments_exchange_shape_check CHECK (
    (exchanged_at IS NULL AND valet_session_id IS NULL AND credential_generation IS NULL)
    OR
    (exchanged_at IS NOT NULL AND valet_session_id IS NOT NULL AND credential_generation > 0)
  ),
  CONSTRAINT guest_browser_enrollments_valet_session_id_fkey
    FOREIGN KEY (valet_session_id) REFERENCES public.valet_sessions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX guest_browser_enrollments_expires_at_idx
  ON public.guest_browser_enrollments(expires_at);

CREATE TABLE public.guest_browser_sessions (
  id UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  valet_session_id UUID NOT NULL,
  credential_generation INTEGER NOT NULL,
  enrollment_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  revoked_at TIMESTAMPTZ(3),
  CONSTRAINT guest_browser_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT guest_browser_sessions_generation_check
    CHECK (credential_generation > 0),
  CONSTRAINT guest_browser_sessions_revocation_time_check
    CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT guest_browser_sessions_enrollment_id_key UNIQUE (enrollment_id),
  CONSTRAINT guest_browser_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT guest_browser_sessions_token_hash_shape_check
    CHECK (token_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  CONSTRAINT guest_browser_sessions_session_generation_key
    UNIQUE (valet_session_id, credential_generation),
  CONSTRAINT guest_browser_sessions_valet_session_id_fkey
    FOREIGN KEY (valet_session_id) REFERENCES public.valet_sessions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT guest_browser_sessions_enrollment_id_fkey
    FOREIGN KEY (enrollment_id) REFERENCES public.guest_browser_enrollments(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX guest_browser_sessions_session_revoked_idx
  ON public.guest_browser_sessions(valet_session_id, revoked_at);

CREATE FUNCTION public.guest_browser_hash_secret(p_secret TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $function$
  SELECT 'sha256:v1:' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8')),
    'hex'
  );
$function$;

CREATE FUNCTION public.guest_browser_enroll(
  p_enrollment_token TEXT,
  p_browser_token TEXT
)
RETURNS TABLE(result_code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF p_enrollment_token IS NULL
     OR p_enrollment_token !~ '^vge1\.[A-Za-z0-9_-]{43}$'
     OR p_browser_token IS NULL
     OR p_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$'
     OR p_enrollment_token = p_browser_token THEN
    RETURN QUERY SELECT 'REQUEST_INVALID'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  v_expires_at := v_now + INTERVAL '15 minutes';
  INSERT INTO public.guest_browser_enrollments(
    enrollment_token_hash,
    browser_session_token_hash,
    created_at,
    expires_at
  ) VALUES (
    public.guest_browser_hash_secret(p_enrollment_token),
    public.guest_browser_hash_secret(p_browser_token),
    v_now,
    v_expires_at
  ) ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'COLLISION'::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'OK'::TEXT, v_expires_at;
END;
$function$;

CREATE FUNCTION public.guest_browser_exchange(
  p_guest_token TEXT,
  p_enrollment_token TEXT,
  p_browser_token TEXT
)
RETURNS TABLE(result_code TEXT, valet_session_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_browser_hash TEXT;
  v_enrollment_hash TEXT;
  v_enrollment_id UUID;
  v_enrollment_expires_at TIMESTAMPTZ;
  v_enrollment_session_id UUID;
  v_enrollment_generation INTEGER;
  v_enrollment_exchanged_at TIMESTAMPTZ;
  v_generation INTEGER;
  v_guest_hash TEXT;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session_id UUID;
  v_state public.valet_session_state;
  v_completed_at TIMESTAMPTZ;
  v_expires_at TIMESTAMPTZ;
  v_revoked_at TIMESTAMPTZ;
  v_consumed_at TIMESTAMPTZ;
BEGIN
  IF p_guest_token IS NULL OR p_guest_token !~ '^[A-Za-z0-9_-]{43}$'
     OR p_enrollment_token IS NULL
     OR p_enrollment_token !~ '^vge1\.[A-Za-z0-9_-]{43}$'
     OR p_browser_token IS NULL
     OR p_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  v_guest_hash := public.guest_browser_hash_secret(p_guest_token);
  v_enrollment_hash := public.guest_browser_hash_secret(p_enrollment_token);
  v_browser_hash := public.guest_browser_hash_secret(p_browser_token);

  SELECT session.id, session.customer_access_generation, session.state,
         session.completed_at, session.customer_access_expires_at,
         session.customer_access_revoked_at, session.customer_access_consumed_at
    INTO v_session_id, v_generation, v_state, v_completed_at, v_expires_at,
         v_revoked_at, v_consumed_at
    FROM public.valet_sessions AS session
   WHERE session.customer_access_token_hash = v_guest_hash
   FOR UPDATE OF session;

  IF NOT FOUND OR v_generation <= 0 OR v_revoked_at IS NOT NULL
     OR v_state = 'CANCELLED'::public.valet_session_state
     OR (v_state = 'COMPLETED'::public.valet_session_state AND
         (v_completed_at IS NULL OR v_completed_at + INTERVAL '24 hours' <= v_now)) THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT enrollment.id, enrollment.expires_at, enrollment.valet_session_id,
         enrollment.credential_generation, enrollment.exchanged_at
    INTO v_enrollment_id, v_enrollment_expires_at, v_enrollment_session_id,
         v_enrollment_generation, v_enrollment_exchanged_at
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.enrollment_token_hash = v_enrollment_hash
     AND enrollment.browser_session_token_hash = v_browser_hash
   FOR UPDATE OF enrollment;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_consumed_at IS NULL THEN
    IF v_expires_at <= v_now
       OR v_enrollment_expires_at <= v_now
       OR v_enrollment_exchanged_at IS NOT NULL
       OR v_enrollment_session_id IS NOT NULL
       OR v_enrollment_generation IS NOT NULL THEN
      RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
      RETURN;
    END IF;

    INSERT INTO public.guest_browser_sessions(
      valet_session_id,
      credential_generation,
      enrollment_id,
      token_hash,
      created_at
    ) VALUES (
      v_session_id,
      v_generation,
      v_enrollment_id,
      v_browser_hash,
      v_now
    );

    UPDATE public.guest_browser_enrollments
       SET valet_session_id = v_session_id,
           credential_generation = v_generation,
           exchanged_at = v_now
     WHERE id = v_enrollment_id;

    UPDATE public.valet_sessions
       SET customer_access_consumed_at = v_now,
           updated_at = v_now
     WHERE id = v_session_id;

    RETURN QUERY SELECT 'AUTHORIZED'::TEXT, v_session_id;
    RETURN;
  END IF;

  IF v_enrollment_exchanged_at IS NULL
     OR v_enrollment_session_id IS DISTINCT FROM v_session_id
     OR v_enrollment_generation IS DISTINCT FROM v_generation
     OR NOT EXISTS (
       SELECT 1
       FROM public.guest_browser_sessions AS browser
       WHERE browser.enrollment_id = v_enrollment_id
         AND browser.valet_session_id = v_session_id
         AND browser.credential_generation = v_generation
         AND browser.token_hash = v_browser_hash
         AND browser.revoked_at IS NULL
     ) THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'RECOVERED'::TEXT, v_session_id;
END;
$function$;

CREATE FUNCTION public.guest_browser_resolve(
  p_browser_token TEXT,
  p_allow_post_visit BOOLEAN
)
RETURNS TABLE(
  result_code TEXT,
  valet_session_id UUID,
  authority_scope TEXT,
  credential_generation INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_browser_id UUID;
  v_browser_hash TEXT;
  v_browser_generation INTEGER;
  v_browser_revoked_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ;
  v_generation INTEGER;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_session_id UUID;
  v_session_revoked_at TIMESTAMPTZ;
  v_state public.valet_session_state;
BEGIN
  IF p_browser_token IS NULL OR p_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$'
     OR p_allow_post_visit IS NULL THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;
  v_browser_hash := public.guest_browser_hash_secret(p_browser_token);

  SELECT browser.id, browser.valet_session_id
    INTO v_browser_id, v_session_id
    FROM public.guest_browser_sessions AS browser
   WHERE browser.token_hash = v_browser_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT session.customer_access_generation, session.customer_access_revoked_at,
         session.state, session.completed_at
    INTO v_generation, v_session_revoked_at, v_state, v_completed_at
    FROM public.valet_sessions AS session
   WHERE session.id = v_session_id
   FOR UPDATE OF session;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT browser.credential_generation, browser.revoked_at
    INTO v_browser_generation, v_browser_revoked_at
    FROM public.guest_browser_sessions AS browser
   WHERE browser.id = v_browser_id
     AND browser.valet_session_id = v_session_id
     AND browser.token_hash = v_browser_hash
   FOR UPDATE OF browser;

  IF NOT FOUND OR v_browser_revoked_at IS NOT NULL
     OR v_session_revoked_at IS NOT NULL
     OR v_browser_generation IS DISTINCT FROM v_generation
     OR v_state = 'CANCELLED'::public.valet_session_state THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  IF v_state = 'COMPLETED'::public.valet_session_state THEN
    IF NOT p_allow_post_visit OR v_completed_at IS NULL
       OR v_completed_at + INTERVAL '24 hours' <= v_now THEN
      RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::TEXT, NULL::INTEGER;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'OK'::TEXT, v_session_id, 'POST_VISIT'::TEXT, v_generation;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'OK'::TEXT, v_session_id, 'ACTIVE'::TEXT, v_generation;
END;
$function$;

CREATE FUNCTION public.guest_browser_end(p_browser_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_browser_hash TEXT;
  v_browser_id UUID;
  v_session_id UUID;
BEGIN
  IF p_browser_token IS NULL OR p_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$' THEN
    RETURN 'INVALID_ACCESS';
  END IF;
  v_browser_hash := public.guest_browser_hash_secret(p_browser_token);
  SELECT id, valet_session_id INTO v_browser_id, v_session_id
    FROM public.guest_browser_sessions WHERE token_hash = v_browser_hash;
  IF NOT FOUND THEN RETURN 'INVALID_ACCESS'; END IF;

  PERFORM session.id FROM public.valet_sessions AS session
   WHERE session.id = v_session_id FOR UPDATE OF session;
  PERFORM browser.id FROM public.guest_browser_sessions AS browser
   WHERE browser.id = v_browser_id AND browser.token_hash = v_browser_hash
   FOR UPDATE OF browser;
  IF FOUND THEN
    UPDATE public.guest_browser_sessions
       SET revoked_at = COALESCE(revoked_at, pg_catalog.clock_timestamp())
     WHERE id = v_browser_id;
    RETURN 'ENDED';
  END IF;
  RETURN 'INVALID_ACCESS';
END;
$function$;

CREATE FUNCTION public.guest_browser_invalidate_for_session(p_valet_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_current_generation INTEGER;
  v_count INTEGER;
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  SELECT customer_access_generation INTO v_current_generation
    FROM public.valet_sessions
   WHERE id = p_valet_session_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  UPDATE public.guest_browser_sessions
     SET revoked_at = COALESCE(revoked_at, v_now)
   WHERE valet_session_id = p_valet_session_id
     AND credential_generation <> v_current_generation
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guest_rating_submit(
  p_guest_token TEXT,
  p_rating INTEGER
)
RETURNS TABLE(
  result_code TEXT,
  valet_session_id UUID,
  rating INTEGER,
  rated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_completed_at TIMESTAMPTZ;
  v_existing_rating INTEGER;
  v_location_id UUID;
  v_organization_id UUID;
  v_rated_at TIMESTAMPTZ;
  v_session_id UUID;
  v_state public.valet_session_state;
  v_token_hash TEXT;
BEGIN
  IF p_guest_token IS NULL OR p_guest_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN QUERY SELECT 'REQUEST_INVALID'::TEXT, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  v_token_hash := public.guest_browser_hash_secret(p_guest_token);

  SELECT session.id, session.organization_id, session.location_id,
         session.state, session.completed_at
    INTO v_session_id, v_organization_id, v_location_id, v_state, v_completed_at
    FROM public.valet_sessions AS session
   WHERE session.customer_access_token_hash = v_token_hash
     AND session.customer_access_consumed_at IS NULL
     AND session.customer_access_revoked_at IS NULL
     AND session.customer_access_expires_at > pg_catalog.clock_timestamp()
   FOR UPDATE OF session;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF v_state <> 'COMPLETED'::public.valet_session_state OR v_completed_at IS NULL THEN
    RETURN QUERY SELECT 'NOT_COMPLETED'::TEXT, v_session_id, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF v_completed_at + INTERVAL '24 hours' <= pg_catalog.clock_timestamp() THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT existing.rating, existing.rated_at INTO v_existing_rating, v_rated_at
    FROM public.guest_ratings AS existing
   WHERE existing.valet_session_id = v_session_id;
  IF FOUND THEN
    IF v_existing_rating = p_rating THEN
      RETURN QUERY SELECT 'OK'::TEXT, v_session_id, v_existing_rating, v_rated_at;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::TEXT, v_session_id, NULL::INTEGER, NULL::TIMESTAMPTZ;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.guest_ratings AS inserted
    (organization_id, location_id, valet_session_id, rating)
  VALUES (v_organization_id, v_location_id, v_session_id, p_rating)
  RETURNING inserted.rated_at INTO v_rated_at;
  RETURN QUERY SELECT 'OK'::TEXT, v_session_id, p_rating, v_rated_at;
END;
$function$;

CREATE FUNCTION public.guest_browser_rating_submit(
  p_browser_token TEXT,
  p_rating INTEGER
)
RETURNS TABLE(
  result_code TEXT,
  valet_session_id UUID,
  rating INTEGER,
  rated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_existing_rating INTEGER;
  v_location_id UUID;
  v_organization_id UUID;
  v_rated_at TIMESTAMPTZ;
  v_session_id UUID;
  v_scope TEXT;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN QUERY SELECT 'REQUEST_INVALID'::TEXT, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT resolved.valet_session_id, resolved.authority_scope
    INTO v_session_id, v_scope
    FROM public.guest_browser_resolve(p_browser_token, TRUE) AS resolved
   WHERE resolved.result_code = 'OK';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  IF v_scope <> 'POST_VISIT' THEN
    RETURN QUERY SELECT 'NOT_COMPLETED'::TEXT, v_session_id, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT organization_id, location_id INTO v_organization_id, v_location_id
    FROM public.valet_sessions WHERE id = v_session_id;

  SELECT existing.rating, existing.rated_at INTO v_existing_rating, v_rated_at
    FROM public.guest_ratings AS existing
   WHERE existing.valet_session_id = v_session_id;
  IF FOUND THEN
    IF v_existing_rating = p_rating THEN
      RETURN QUERY SELECT 'OK'::TEXT, v_session_id, v_existing_rating, v_rated_at;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::TEXT, v_session_id, NULL::INTEGER, NULL::TIMESTAMPTZ;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.guest_ratings AS inserted
    (organization_id, location_id, valet_session_id, rating)
  VALUES (v_organization_id, v_location_id, v_session_id, p_rating)
  RETURNING inserted.rated_at INTO v_rated_at;
  RETURN QUERY SELECT 'OK'::TEXT, v_session_id, p_rating, v_rated_at;
END;
$function$;

REVOKE ALL ON TABLE public.guest_browser_enrollments FROM PUBLIC;
REVOKE ALL ON TABLE public.guest_browser_sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_hash_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_enroll(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_exchange(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_resolve(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_end(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_invalidate_for_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_browser_rating_submit(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_rating_submit(TEXT, INTEGER) FROM PUBLIC;

COMMIT;

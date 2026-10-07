BEGIN;

ALTER TABLE public.guest_browser_enrollments
  ADD COLUMN browser_context_marker TEXT NOT NULL DEFAULT (
    'vgc1.' || pg_catalog.replace(pg_catalog.gen_random_uuid()::TEXT, '-', '')
  ),
  ADD COLUMN source_browser_session_id UUID;

ALTER TABLE public.guest_browser_enrollments
  ADD CONSTRAINT guest_browser_enrollments_browser_context_marker_key
    UNIQUE (browser_context_marker),
  ADD CONSTRAINT guest_browser_enrollments_browser_context_marker_shape_check
    CHECK (browser_context_marker ~ '^vgc1\.[0-9a-f]{32}$');

ALTER TABLE public.guest_browser_enrollments
  DROP CONSTRAINT guest_browser_enrollments_exchange_shape_check,
  ADD CONSTRAINT guest_browser_enrollments_exchange_shape_check CHECK (
    (
      exchanged_at IS NULL
      AND (
        (source_browser_session_id IS NULL AND valet_session_id IS NULL AND credential_generation IS NULL)
        OR
        (source_browser_session_id IS NOT NULL AND valet_session_id IS NOT NULL AND credential_generation > 0)
      )
    )
    OR
    (exchanged_at IS NOT NULL AND valet_session_id IS NOT NULL AND credential_generation > 0)
  ),
  ADD CONSTRAINT guest_browser_enrollments_source_browser_session_id_fkey
    FOREIGN KEY (source_browser_session_id) REFERENCES public.guest_browser_sessions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX guest_browser_enrollments_source_browser_session_id_idx
  ON public.guest_browser_enrollments(source_browser_session_id);

CREATE OR REPLACE FUNCTION public.guest_browser_enroll(
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

  WITH expired_unexchanged AS (
    SELECT enrollment.id
    FROM public.guest_browser_enrollments AS enrollment
    WHERE enrollment.expires_at <= v_now
      AND enrollment.exchanged_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.guest_browser_sessions AS browser
        WHERE browser.enrollment_id = enrollment.id
      )
    ORDER BY enrollment.expires_at, enrollment.id
    LIMIT 256
    FOR UPDATE OF enrollment SKIP LOCKED
  )
  DELETE FROM public.guest_browser_enrollments AS enrollment
  USING expired_unexchanged
  WHERE enrollment.id = expired_unexchanged.id;

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

REVOKE ALL ON FUNCTION public.guest_browser_enroll(TEXT, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.guest_browser_exchange(
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
  v_enrollment_source_browser_session_id UUID;
  v_enrollment_exchanged_at TIMESTAMPTZ;
  v_generation INTEGER;
  v_guest_hash TEXT;
  v_now TIMESTAMPTZ;
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

  v_now := pg_catalog.clock_timestamp();
  IF NOT FOUND OR v_generation <= 0 OR v_revoked_at IS NOT NULL
     OR v_state = 'CANCELLED'::public.valet_session_state
     OR (v_state = 'COMPLETED'::public.valet_session_state AND
         (v_completed_at IS NULL OR v_completed_at + INTERVAL '24 hours' <= v_now)) THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT enrollment.id, enrollment.expires_at, enrollment.valet_session_id,
         enrollment.credential_generation, enrollment.source_browser_session_id,
         enrollment.exchanged_at
    INTO v_enrollment_id, v_enrollment_expires_at, v_enrollment_session_id,
         v_enrollment_generation, v_enrollment_source_browser_session_id,
         v_enrollment_exchanged_at
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.enrollment_token_hash = v_enrollment_hash
     AND enrollment.browser_session_token_hash = v_browser_hash
   FOR UPDATE OF enrollment;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_enrollment_source_browser_session_id IS NOT NULL THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_generation <= 0 OR v_revoked_at IS NOT NULL
     OR v_state = 'CANCELLED'::public.valet_session_state
     OR (v_state = 'COMPLETED'::public.valet_session_state AND
         (v_completed_at IS NULL OR v_completed_at + INTERVAL '24 hours' <= v_now)) THEN
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
REVOKE ALL ON FUNCTION public.guest_browser_exchange(TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;

BEGIN;

CREATE FUNCTION public.guest_browser_reconcile_switch(
  p_source_browser_token TEXT,
  p_enrollment_token TEXT,
  p_pending_browser_token TEXT
)
RETURNS TABLE(result_code TEXT, browser_context_marker TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_context_marker TEXT;
  v_enrollment_exchanged_at TIMESTAMPTZ;
  v_enrollment_generation INTEGER;
  v_enrollment_hash TEXT;
  v_enrollment_id UUID;
  v_pending_hash TEXT;
  v_source_browser_id UUID;
  v_source_browser_revoked_at TIMESTAMPTZ;
  v_source_hash TEXT;
  v_source_session_id UUID;
  v_target_browser_revoked_at TIMESTAMPTZ;
  v_target_completed_at TIMESTAMPTZ;
  v_target_generation INTEGER;
  v_target_revoked_at TIMESTAMPTZ;
  v_target_session_id UUID;
  v_target_state public.valet_session_state;
  v_now TIMESTAMPTZ;
BEGIN
  IF p_source_browser_token IS NULL
     OR p_source_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$'
     OR p_enrollment_token IS NULL
     OR p_enrollment_token !~ '^vge1\.[A-Za-z0-9_-]{43}$'
     OR p_pending_browser_token IS NULL
     OR p_pending_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'NONE'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_source_hash := public.guest_browser_hash_secret(p_source_browser_token);
  v_enrollment_hash := public.guest_browser_hash_secret(p_enrollment_token);
  v_pending_hash := public.guest_browser_hash_secret(p_pending_browser_token);

  SELECT enrollment.id, enrollment.valet_session_id,
         enrollment.credential_generation, enrollment.exchanged_at,
         enrollment.source_browser_session_id
    INTO v_enrollment_id, v_target_session_id, v_enrollment_generation,
         v_enrollment_exchanged_at, v_source_browser_id
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.enrollment_token_hash = v_enrollment_hash
     AND enrollment.browser_session_token_hash = v_pending_hash;
  IF NOT FOUND OR v_target_session_id IS NULL OR v_enrollment_generation IS NULL
     OR v_source_browser_id IS NULL THEN
    RETURN QUERY SELECT 'NONE'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT browser.valet_session_id INTO v_source_session_id
    FROM public.guest_browser_sessions AS browser
   WHERE browser.id = v_source_browser_id
     AND browser.token_hash = v_source_hash;
  IF NOT FOUND OR v_source_session_id = v_target_session_id THEN
    RETURN QUERY SELECT 'NONE'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_session_id < v_target_session_id THEN
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_source_session_id FOR UPDATE OF session;
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_target_session_id FOR UPDATE OF session;
  ELSE
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_target_session_id FOR UPDATE OF session;
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_source_session_id FOR UPDATE OF session;
  END IF;

  SELECT enrollment.valet_session_id, enrollment.credential_generation,
         enrollment.exchanged_at, enrollment.browser_context_marker
    INTO v_target_session_id, v_enrollment_generation, v_enrollment_exchanged_at,
         v_context_marker
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.id = v_enrollment_id
     AND enrollment.source_browser_session_id = v_source_browser_id
     AND enrollment.enrollment_token_hash = v_enrollment_hash
     AND enrollment.browser_session_token_hash = v_pending_hash
   FOR UPDATE OF enrollment;
  IF NOT FOUND OR v_enrollment_exchanged_at IS NULL THEN
    RETURN QUERY SELECT 'NONE'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT browser.revoked_at INTO v_source_browser_revoked_at
    FROM public.guest_browser_sessions AS browser
   WHERE browser.id = v_source_browser_id
     AND browser.valet_session_id = v_source_session_id
     AND browser.token_hash = v_source_hash
   FOR UPDATE OF browser;
  IF NOT FOUND OR v_source_browser_revoked_at IS NULL THEN
    RETURN QUERY SELECT 'NONE'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT session.customer_access_generation, session.customer_access_revoked_at,
         session.state, session.completed_at
    INTO v_target_generation, v_target_revoked_at, v_target_state,
         v_target_completed_at
    FROM public.valet_sessions AS session
   WHERE session.id = v_target_session_id;
  SELECT browser.revoked_at INTO v_target_browser_revoked_at
    FROM public.guest_browser_sessions AS browser
   WHERE browser.enrollment_id = v_enrollment_id
     AND browser.valet_session_id = v_target_session_id
     AND browser.credential_generation = v_enrollment_generation
     AND browser.token_hash = v_pending_hash
   FOR UPDATE OF browser;

  v_now := pg_catalog.clock_timestamp();
  IF NOT FOUND OR v_target_browser_revoked_at IS NOT NULL
     OR v_target_generation IS DISTINCT FROM v_enrollment_generation
     OR v_target_revoked_at IS NOT NULL
     OR v_target_state = 'CANCELLED'::public.valet_session_state
     OR (
       v_target_state = 'COMPLETED'::public.valet_session_state
       AND (
         v_target_completed_at IS NULL
         OR v_target_completed_at + INTERVAL '24 hours' <= v_now
       )
     ) THEN
    RETURN QUERY SELECT 'NONE'::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'RECOVERED'::TEXT, v_context_marker;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_browser_reconcile_switch(TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;

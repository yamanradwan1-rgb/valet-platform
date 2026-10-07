BEGIN;

CREATE FUNCTION public.guest_browser_prepare_context(
  p_guest_token TEXT,
  p_source_browser_token TEXT,
  p_enrollment_token TEXT,
  p_pending_browser_token TEXT
)
RETURNS TABLE(result_code TEXT, authority_scope TEXT, browser_context_marker TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_context_marker TEXT;
  v_enrollment_hash TEXT;
  v_expires_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_pending_hash TEXT;
  v_source_browser_generation INTEGER;
  v_source_browser_id UUID;
  v_source_browser_revoked_at TIMESTAMPTZ;
  v_source_generation INTEGER;
  v_source_hash TEXT;
  v_source_revoked_at TIMESTAMPTZ;
  v_source_scope TEXT;
  v_source_session_id UUID;
  v_source_state public.valet_session_state;
  v_source_completed_at TIMESTAMPTZ;
  v_target_completed_at TIMESTAMPTZ;
  v_target_consumed_at TIMESTAMPTZ;
  v_target_expires_at TIMESTAMPTZ;
  v_target_generation INTEGER;
  v_target_hash TEXT;
  v_target_current_hash TEXT;
  v_target_revoked_at TIMESTAMPTZ;
  v_target_session_id UUID;
  v_target_state public.valet_session_state;
BEGIN
  IF p_guest_token IS NULL OR p_guest_token !~ '^[A-Za-z0-9_-]{43}$'
     OR p_enrollment_token IS NULL
     OR p_enrollment_token !~ '^vge1\.[A-Za-z0-9_-]{43}$'
     OR p_pending_browser_token IS NULL
     OR p_pending_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$'
     OR (p_source_browser_token IS NOT NULL
         AND p_source_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$') THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_target_hash := public.guest_browser_hash_secret(p_guest_token);
  v_enrollment_hash := public.guest_browser_hash_secret(p_enrollment_token);
  v_pending_hash := public.guest_browser_hash_secret(p_pending_browser_token);
  IF p_source_browser_token IS NOT NULL THEN
    v_source_hash := public.guest_browser_hash_secret(p_source_browser_token);
  END IF;

  SELECT session.id INTO v_target_session_id
    FROM public.valet_sessions AS session
   WHERE session.customer_access_token_hash = v_target_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_hash IS NOT NULL THEN
    SELECT browser.id, browser.valet_session_id
      INTO v_source_browser_id, v_source_session_id
      FROM public.guest_browser_sessions AS browser
     WHERE browser.token_hash = v_source_hash;
  END IF;

  IF v_source_session_id IS NULL OR v_source_session_id = v_target_session_id THEN
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_target_session_id FOR UPDATE OF session;
  ELSIF v_source_session_id < v_target_session_id THEN
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

  SELECT session.customer_access_generation,
         session.customer_access_token_hash,
         session.customer_access_revoked_at, session.customer_access_consumed_at,
         session.customer_access_expires_at, session.state, session.completed_at
    INTO v_target_generation, v_target_current_hash, v_target_revoked_at,
         v_target_consumed_at, v_target_expires_at, v_target_state,
         v_target_completed_at
    FROM public.valet_sessions AS session
   WHERE session.id = v_target_session_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_session_id IS NOT NULL THEN
    SELECT session.customer_access_generation,
           session.customer_access_revoked_at, session.state, session.completed_at
      INTO v_source_generation, v_source_revoked_at,
           v_source_state, v_source_completed_at
      FROM public.valet_sessions AS session
     WHERE session.id = v_source_session_id;
    SELECT browser.credential_generation, browser.revoked_at
      INTO v_source_browser_generation, v_source_browser_revoked_at
      FROM public.guest_browser_sessions AS browser
     WHERE browser.id = v_source_browser_id
       AND browser.valet_session_id = v_source_session_id
       AND browser.token_hash = v_source_hash
     FOR UPDATE OF browser;
    IF NOT FOUND THEN
      v_source_session_id := NULL;
    END IF;
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_source_session_id IS NOT NULL
     AND v_source_browser_revoked_at IS NULL
     AND v_source_revoked_at IS NULL
     AND v_source_browser_generation IS NOT DISTINCT FROM v_source_generation
     AND v_source_state <> 'CANCELLED'::public.valet_session_state
     AND (
       v_source_state <> 'COMPLETED'::public.valet_session_state
       OR (
         v_source_completed_at IS NOT NULL
         AND v_source_completed_at + INTERVAL '24 hours' > v_now
       )
     ) THEN
    v_source_scope := CASE
      WHEN v_source_state = 'COMPLETED'::public.valet_session_state THEN 'POST_VISIT'
      ELSE 'ACTIVE'
    END;
  ELSE
    v_source_session_id := NULL;
    v_source_browser_id := NULL;
    v_source_scope := NULL;
  END IF;

  IF v_target_current_hash IS DISTINCT FROM v_target_hash THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_session_id IS NOT NULL
     AND v_source_session_id = v_target_session_id
     AND v_source_browser_generation IS NOT DISTINCT FROM v_target_generation THEN
    SELECT enrollment.browser_context_marker INTO v_context_marker
      FROM public.guest_browser_sessions AS browser
      JOIN public.guest_browser_enrollments AS enrollment
        ON enrollment.id = browser.enrollment_id
     WHERE browser.id = v_source_browser_id;
    RETURN QUERY SELECT 'SAME_VISIT'::TEXT, v_source_scope, v_context_marker;
    RETURN;
  END IF;

  IF v_target_generation <= 0
     OR v_target_revoked_at IS NOT NULL
     OR v_target_consumed_at IS NOT NULL
     OR v_target_expires_at <= v_now
     OR v_target_state = 'CANCELLED'::public.valet_session_state
     OR (
       v_target_state = 'COMPLETED'::public.valet_session_state
       AND (
         v_target_completed_at IS NULL
         OR v_target_completed_at + INTERVAL '24 hours' <= v_now
       )
     ) THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  WITH expired_unexchanged AS (
    SELECT enrollment.id
    FROM public.guest_browser_enrollments AS enrollment
    WHERE enrollment.expires_at <= v_now
      AND enrollment.exchanged_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.guest_browser_sessions AS browser
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
  INSERT INTO public.guest_browser_enrollments AS inserted(
    enrollment_token_hash,
    browser_session_token_hash,
    created_at,
    expires_at,
    valet_session_id,
    credential_generation,
    source_browser_session_id
  ) VALUES (
    v_enrollment_hash,
    v_pending_hash,
    v_now,
    v_expires_at,
    CASE WHEN v_source_session_id IS NULL THEN NULL ELSE v_target_session_id END,
    CASE WHEN v_source_session_id IS NULL THEN NULL ELSE v_target_generation END,
    v_source_browser_id
  ) ON CONFLICT DO NOTHING
  RETURNING inserted.browser_context_marker INTO v_context_marker;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_session_id IS NULL THEN
    RETURN QUERY SELECT 'ENROLLMENT_READY'::TEXT, NULL::TEXT, v_context_marker;
  ELSE
    RETURN QUERY SELECT 'CONTEXT_CONFLICT'::TEXT, v_source_scope, v_context_marker;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_browser_prepare_context(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;

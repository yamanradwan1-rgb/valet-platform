BEGIN;

CREATE FUNCTION public.guest_browser_switch_context(
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
  v_enrollment_exchanged_at TIMESTAMPTZ;
  v_enrollment_expires_at TIMESTAMPTZ;
  v_enrollment_generation INTEGER;
  v_enrollment_hash TEXT;
  v_enrollment_id UUID;
  v_enrollment_source_browser_id UUID;
  v_enrollment_target_session_id UUID;
  v_now TIMESTAMPTZ;
  v_pending_hash TEXT;
  v_source_browser_generation INTEGER;
  v_source_browser_id UUID;
  v_source_browser_revoked_at TIMESTAMPTZ;
  v_source_generation INTEGER;
  v_source_hash TEXT;
  v_source_org UUID;
  v_source_revoked_at TIMESTAMPTZ;
  v_source_session_id UUID;
  v_source_state public.valet_session_state;
  v_source_completed_at TIMESTAMPTZ;
  v_target_browser_revoked_at TIMESTAMPTZ;
  v_target_completed_at TIMESTAMPTZ;
  v_target_consumed_at TIMESTAMPTZ;
  v_target_expires_at TIMESTAMPTZ;
  v_target_generation INTEGER;
  v_target_hash TEXT;
  v_target_org UUID;
  v_target_revoked_at TIMESTAMPTZ;
  v_target_state public.valet_session_state;
  v_target_scope TEXT;
BEGIN
  IF p_guest_token IS NULL OR p_guest_token !~ '^[A-Za-z0-9_-]{43}$'
     OR p_source_browser_token IS NULL
     OR p_source_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$'
     OR p_enrollment_token IS NULL
     OR p_enrollment_token !~ '^vge1\.[A-Za-z0-9_-]{43}$'
     OR p_pending_browser_token IS NULL
     OR p_pending_browser_token !~ '^vgb1\.[A-Za-z0-9_-]{43}$' THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_target_hash := public.guest_browser_hash_secret(p_guest_token);
  v_source_hash := public.guest_browser_hash_secret(p_source_browser_token);
  v_enrollment_hash := public.guest_browser_hash_secret(p_enrollment_token);
  v_pending_hash := public.guest_browser_hash_secret(p_pending_browser_token);

  SELECT enrollment.id, enrollment.valet_session_id,
         enrollment.credential_generation, enrollment.source_browser_session_id,
         enrollment.exchanged_at, enrollment.expires_at
    INTO v_enrollment_id, v_enrollment_target_session_id,
         v_enrollment_generation, v_enrollment_source_browser_id,
         v_enrollment_exchanged_at, v_enrollment_expires_at
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.enrollment_token_hash = v_enrollment_hash
     AND enrollment.browser_session_token_hash = v_pending_hash;
  IF NOT FOUND OR v_enrollment_target_session_id IS NULL
     OR v_enrollment_generation IS NULL
     OR v_enrollment_source_browser_id IS NULL THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT browser.id, browser.valet_session_id
    INTO v_source_browser_id, v_source_session_id
    FROM public.guest_browser_sessions AS browser
   WHERE browser.token_hash = v_source_hash;
  IF NOT FOUND OR v_source_browser_id IS DISTINCT FROM v_enrollment_source_browser_id
     OR v_source_session_id = v_enrollment_target_session_id THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_session_id < v_enrollment_target_session_id THEN
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_source_session_id FOR UPDATE OF session;
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_enrollment_target_session_id FOR UPDATE OF session;
  ELSE
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_enrollment_target_session_id FOR UPDATE OF session;
    PERFORM session.id FROM public.valet_sessions AS session
     WHERE session.id = v_source_session_id FOR UPDATE OF session;
  END IF;

  SELECT session.organization_id, session.customer_access_generation,
         session.customer_access_revoked_at, session.state, session.completed_at
    INTO v_source_org, v_source_generation, v_source_revoked_at,
         v_source_state, v_source_completed_at
    FROM public.valet_sessions AS session
   WHERE session.id = v_source_session_id;
  SELECT session.organization_id, session.customer_access_generation,
         session.customer_access_revoked_at, session.customer_access_consumed_at,
         session.customer_access_expires_at, session.state, session.completed_at
    INTO v_target_org, v_target_generation, v_target_revoked_at,
         v_target_consumed_at, v_target_expires_at, v_target_state,
         v_target_completed_at
    FROM public.valet_sessions AS session
   WHERE session.id = v_enrollment_target_session_id;

  SELECT enrollment.valet_session_id, enrollment.credential_generation,
         enrollment.source_browser_session_id, enrollment.exchanged_at,
         enrollment.expires_at
    INTO v_enrollment_target_session_id, v_enrollment_generation,
         v_enrollment_source_browser_id, v_enrollment_exchanged_at,
         v_enrollment_expires_at
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.id = v_enrollment_id
     AND enrollment.enrollment_token_hash = v_enrollment_hash
     AND enrollment.browser_session_token_hash = v_pending_hash
   FOR UPDATE OF enrollment;
  IF NOT FOUND OR v_enrollment_source_browser_id IS DISTINCT FROM v_source_browser_id THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT browser.credential_generation, browser.revoked_at
    INTO v_source_browser_generation, v_source_browser_revoked_at
    FROM public.guest_browser_sessions AS browser
   WHERE browser.id = v_source_browser_id
     AND browser.valet_session_id = v_source_session_id
     AND browser.token_hash = v_source_hash
   FOR UPDATE OF browser;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_now := pg_catalog.clock_timestamp();
  SELECT enrollment.browser_context_marker INTO v_context_marker
    FROM public.guest_browser_enrollments AS enrollment
   WHERE enrollment.id = v_enrollment_id;
  v_target_scope := CASE
    WHEN v_target_state = 'COMPLETED'::public.valet_session_state THEN 'POST_VISIT'
    ELSE 'ACTIVE'
  END;

  IF v_enrollment_exchanged_at IS NOT NULL THEN
    SELECT browser.revoked_at INTO v_target_browser_revoked_at
      FROM public.guest_browser_sessions AS browser
     WHERE browser.enrollment_id = v_enrollment_id
       AND browser.valet_session_id = v_enrollment_target_session_id
       AND browser.credential_generation = v_enrollment_generation
       AND browser.token_hash = v_pending_hash
     FOR UPDATE OF browser;
    IF FOUND
       AND v_target_browser_revoked_at IS NULL
       AND v_enrollment_generation IS NOT DISTINCT FROM v_target_generation
       AND v_target_revoked_at IS NULL
       AND v_target_hash = (
         SELECT session.customer_access_token_hash
           FROM public.valet_sessions AS session
          WHERE session.id = v_enrollment_target_session_id
       )
       AND v_target_state <> 'CANCELLED'::public.valet_session_state
       AND (
         v_target_state <> 'COMPLETED'::public.valet_session_state
         OR (
           v_target_completed_at IS NOT NULL
           AND v_target_completed_at + INTERVAL '24 hours' > v_now
         )
       ) THEN
      RETURN QUERY SELECT 'RECOVERED'::TEXT, v_target_scope, v_context_marker;
      RETURN;
    END IF;
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_source_browser_revoked_at IS NOT NULL
     OR v_source_revoked_at IS NOT NULL
     OR v_source_browser_generation IS DISTINCT FROM v_source_generation
     OR v_source_state = 'CANCELLED'::public.valet_session_state
     OR (
       v_source_state = 'COMPLETED'::public.valet_session_state
       AND (
         v_source_completed_at IS NULL
         OR v_source_completed_at + INTERVAL '24 hours' <= v_now
       )
     )
     OR v_source_org IS DISTINCT FROM v_target_org
     OR v_target_generation IS DISTINCT FROM v_enrollment_generation
     OR v_target_revoked_at IS NOT NULL
     OR v_target_consumed_at IS NOT NULL
     OR v_enrollment_expires_at <= v_now
     OR v_target_expires_at <= v_now
     OR v_target_state = 'CANCELLED'::public.valet_session_state
     OR (
       v_target_state = 'COMPLETED'::public.valet_session_state
       AND (
         v_target_completed_at IS NULL
         OR v_target_completed_at + INTERVAL '24 hours' <= v_now
       )
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.valet_sessions AS session
        WHERE session.id = v_enrollment_target_session_id
          AND session.customer_access_token_hash = v_target_hash
     )
     OR EXISTS (
       SELECT 1 FROM public.guest_browser_sessions AS browser
        WHERE browser.valet_session_id = v_enrollment_target_session_id
          AND browser.credential_generation = v_enrollment_generation
     ) THEN
    RETURN QUERY SELECT 'INVALID_ACCESS'::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.guest_browser_sessions(
    valet_session_id,
    credential_generation,
    enrollment_id,
    token_hash,
    created_at
  ) VALUES (
    v_enrollment_target_session_id,
    v_enrollment_generation,
    v_enrollment_id,
    v_pending_hash,
    v_now
  );
  UPDATE public.guest_browser_enrollments
     SET exchanged_at = v_now
   WHERE id = v_enrollment_id;
  UPDATE public.valet_sessions
     SET customer_access_consumed_at = v_now,
         updated_at = v_now
   WHERE id = v_enrollment_target_session_id;
  UPDATE public.guest_browser_sessions
     SET revoked_at = v_now
   WHERE id = v_source_browser_id
     AND revoked_at IS NULL;

  RETURN QUERY SELECT 'SWITCHED'::TEXT, v_target_scope, v_context_marker;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_browser_switch_context(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

COMMIT;

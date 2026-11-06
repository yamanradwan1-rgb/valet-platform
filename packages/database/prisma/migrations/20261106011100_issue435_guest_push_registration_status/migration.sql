BEGIN;

CREATE FUNCTION public.guest_push_registration_status_v1(
  p_browser_token TEXT,
  p_endpoint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_browser_id UUID;
  v_session_id UUID;
  v_generation INTEGER;
  v_organization_id UUID;
  v_location_id UUID;
  v_eligible BOOLEAN;
BEGIN
  IF p_endpoint IS NULL OR length(p_endpoint) > 4096 OR NOT (
    p_endpoint ~ '^https://fcm\.googleapis\.com(?::443)?/[^#[:space:]]+$'
    OR p_endpoint ~ '^https://[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.push\.apple\.com(?::443)?/[^#[:space:]]+$'
  ) THEN
    RETURN NULL;
  END IF;

  -- The resolver locks the visit and exact Browser Session in authority order.
  SELECT resolved.valet_session_id, resolved.credential_generation
    INTO v_session_id, v_generation
    FROM public.guest_browser_resolve(p_browser_token, FALSE) AS resolved
   WHERE resolved.result_code = 'OK' AND resolved.authority_scope = 'ACTIVE';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT browser.id, session.organization_id, session.location_id,
         session.ready_at IS NULL AND session.state <> 'READY'
         AND COALESCE(location.guest_vehicle_ready_notification_enabled_override,
                      organization.guest_vehicle_ready_notification_enabled)
    INTO v_browser_id, v_organization_id, v_location_id, v_eligible
    FROM public.guest_browser_sessions AS browser
    JOIN public.valet_sessions AS session
      ON session.id = browser.valet_session_id
     AND session.customer_access_generation = v_generation
     AND session.customer_access_revoked_at IS NULL
    JOIN public.organizations AS organization
      ON organization.id = session.organization_id AND organization.status = 'ACTIVE'
    JOIN public.locations AS location
      ON location.id = session.location_id
     AND location.organization_id = session.organization_id AND location.status = 'ACTIVE'
   WHERE browser.token_hash = public.guest_browser_hash_secret(p_browser_token)
     AND browser.valet_session_id = v_session_id
     AND browser.credential_generation = v_generation
     AND browser.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_eligible IS DISTINCT FROM TRUE THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.guest_push_registrations AS registration
     WHERE registration.guest_browser_session_id = v_browser_id
       AND registration.valet_session_id = v_session_id
       AND registration.credential_generation = v_generation
       AND registration.organization_id = v_organization_id
       AND registration.location_id = v_location_id
       AND registration.state = 'ACTIVE'
       AND registration.terminal_at IS NULL
       AND registration.endpoint_hash = 'guest-push-endpoint-sha256:v1:' ||
         pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_endpoint, 'UTF8')), 'hex')
       AND registration.endpoint = p_endpoint
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_push_registration_status_v1(TEXT, TEXT) FROM PUBLIC;

COMMIT;

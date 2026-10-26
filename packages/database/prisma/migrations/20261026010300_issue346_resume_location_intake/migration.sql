-- #346: explicit Resume only. No drain check or operational record mutation.
CREATE FUNCTION public.management_location_resume_intake(
  p_actor_membership_id UUID,
  p_organization_id UUID,
  p_location_id UUID,
  p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v RECORD;
  v_time TIMESTAMPTZ(3);
BEGIN
  PERFORM public.management_location_lock(p_location_id, FALSE);
  PERFORM public.management_location_authorize_actor(p_actor_membership_id, p_organization_id);
  SELECT * INTO v FROM public.locations
    WHERE id = p_location_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
  IF v.status <> 'ACTIVE' THEN
    RETURN QUERY SELECT v.updated_at, FALSE, 'LOCATION_INVALID_STATE';
    RETURN;
  END IF;
  -- A repeated desired state is read-only, even if its caller version is old.
  IF v.accepting_intake THEN
    RETURN QUERY SELECT v.updated_at, FALSE, 'OK';
    RETURN;
  END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT v.updated_at, FALSE, 'LOCATION_LIFECYCLE_CONFLICT';
    RETURN;
  END IF;
  v_time := GREATEST(clock_timestamp(), v.updated_at + INTERVAL '0.001 second');
  UPDATE public.locations SET accepting_intake = TRUE, updated_at = v_time
    WHERE id = p_location_id AND organization_id = p_organization_id;
  PERFORM public.management_location_append_audit(
    p_organization_id, p_location_id, p_actor_membership_id,
    'LOCATION_INTAKE_RESUMED',
    jsonb_build_object('fromAcceptingIntake', FALSE, 'toAcceptingIntake', TRUE,
      'status', 'ACTIVE', 'previousUpdatedAt', v.updated_at, 'updatedAt', v_time)
  );
  RETURN QUERY SELECT v_time, TRUE, 'OK';
END;
$$;
REVOKE ALL ON FUNCTION public.management_location_resume_intake(UUID, UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC;

-- Preserve the existing owner-only lifecycle audit boundary for the new event.
CREATE OR REPLACE FUNCTION public.management_location_guard_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.event_type IN ('LOCATION_CREATED', 'LOCATION_ACTIVATED', 'LOCATION_INTAKE_STOPPED',
      'LOCATION_INTAKE_RESUMED', 'LOCATION_DEACTIVATED', 'LOCATION_CURRENCY_CORRECTED',
      'LOCATION_TIMEZONE_CORRECTED')
     AND current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class
                           WHERE oid = 'public.audit_events'::regclass) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;

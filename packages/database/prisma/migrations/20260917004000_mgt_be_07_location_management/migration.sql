-- MGT-BE-07 / DEC-094: Location lifecycle, intake fencing, and narrow writes.
ALTER TABLE public.locations
  ADD COLUMN accepting_intake BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.locations
SET accepting_intake = (status = 'ACTIVE');

ALTER TABLE public.locations ALTER COLUMN status SET DEFAULT 'INACTIVE';
ALTER TABLE public.locations ADD CONSTRAINT locations_inactive_intake_closed_check
  CHECK (status = 'ACTIVE' OR accepting_intake = FALSE);

CREATE UNIQUE INDEX audit_events_location_create_operation_key
ON public.audit_events(organization_id, idempotency_key)
WHERE event_type = 'LOCATION_CREATED' AND idempotency_key IS NOT NULL;

CREATE INDEX valet_sessions_location_id_non_completed_idx
ON public.valet_sessions(location_id) WHERE state <> 'COMPLETED';

CREATE INDEX tasks_location_id_non_terminal_idx
ON public.tasks(location_id) WHERE status NOT IN ('COMPLETED', 'CANCELLED');

CREATE FUNCTION public.management_location_lock(p_location_id UUID, p_shared BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_shared THEN
    PERFORM pg_catalog.pg_advisory_xact_lock_shared(
      pg_catalog.hashtextextended('location-lifecycle:' || p_location_id::text, 0));
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('location-lifecycle:' || p_location_id::text, 0));
  END IF;
END;
$$;

CREATE FUNCTION public.management_location_authorize_actor(
  p_actor_membership_id UUID, p_organization_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1
  FROM public.organization_memberships membership
  JOIN public.users actor ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
  JOIN public.organizations organization
    ON organization.id = membership.organization_id AND organization.status = 'ACTIVE'
  WHERE membership.id = p_actor_membership_id
    AND membership.organization_id = p_organization_id
    AND membership.status = 'ACTIVE' AND membership.role = 'ORG_ADMIN'
  FOR UPDATE OF membership, organization;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
END;
$$;

CREATE FUNCTION public.management_location_append_audit(
  p_organization_id UUID, p_location_id UUID, p_actor_membership_id UUID,
  p_event_type TEXT, p_metadata JSONB, p_idempotency_key TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.audit_events(
    id, organization_id, location_id, valet_session_id, actor_membership_id,
    actor_type, event_type, entity_type, entity_id, metadata_json,
    idempotency_key, occurred_at
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_location_id, NULL, p_actor_membership_id,
    'MEMBERSHIP', p_event_type, 'Location', p_location_id, p_metadata,
    p_idempotency_key, clock_timestamp()
  );
END;
$$;

CREATE FUNCTION public.management_location_guard_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.event_type IN ('LOCATION_CREATED','LOCATION_ACTIVATED','LOCATION_INTAKE_STOPPED',
      'LOCATION_DEACTIVATED','LOCATION_CURRENCY_CORRECTED','LOCATION_TIMEZONE_CORRECTED')
     AND current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class
                           WHERE oid='public.audit_events'::regclass) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_events_management_location_guard BEFORE INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.management_location_guard_audit_event();

CREATE FUNCTION public.management_location_has_blockers(
  p_organization_id UUID, p_location_id UUID
) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS(SELECT 1 FROM public.valet_sessions
    WHERE organization_id=p_organization_id AND location_id=p_location_id AND state <> 'COMPLETED')
    OR EXISTS(SELECT 1 FROM public.shifts
    WHERE organization_id=p_organization_id AND location_id=p_location_id AND status='ACTIVE')
    OR EXISTS(SELECT 1 FROM public.tasks
    WHERE organization_id=p_organization_id AND location_id=p_location_id
      AND status IN ('QUEUED','ASSIGNED','ACCEPTED','IN_PROGRESS'))
$$;

CREATE FUNCTION public.management_location_create(
  p_actor_membership_id UUID, p_organization_id UUID, p_operation_id UUID,
  p_location_id UUID, p_request_fingerprint TEXT, p_name TEXT, p_code TEXT,
  p_address_text TEXT, p_timezone TEXT, p_currency TEXT
) RETURNS TABLE(location_id UUID, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_existing RECORD; v_exponent INTEGER;
BEGIN
  PERFORM public.management_location_authorize_actor(p_actor_membership_id,p_organization_id);
  IF p_operation_id IS NULL OR p_location_id IS NULL OR p_request_fingerprint IS NULL OR p_name IS NULL OR p_code IS NULL OR p_address_text IS NULL OR p_timezone IS NULL OR p_currency IS NULL THEN RETURN QUERY SELECT NULL::UUID,FALSE,'CONFIGURATION_VALUE_INVALID'; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'management-location-create:' || p_organization_id::text || ':' || p_operation_id::text,0));
  SELECT entity_id, metadata_json INTO v_existing FROM public.audit_events
   WHERE organization_id=p_organization_id AND event_type='LOCATION_CREATED'
     AND idempotency_key=p_operation_id::text LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.entity_id,
      FALSE, CASE WHEN v_existing.metadata_json->>'requestFingerprint'=p_request_fingerprint
                  THEN 'OK' ELSE 'IDEMPOTENCY_CONFLICT' END;
    RETURN;
  END IF;
  v_exponent := public.location_configuration_minor_unit_exponent(p_currency);
  IF p_request_fingerprint !~ '^[0-9a-f]{64}$' OR btrim(p_name)='' OR char_length(p_name)>200
     OR btrim(p_code)='' OR char_length(p_code)>100
     OR btrim(p_address_text)='' OR char_length(p_address_text)>1000
     OR char_length(p_timezone)>255 OR v_exponent IS NULL OR v_exponent NOT BETWEEN 0 AND 3
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
    RETURN QUERY SELECT NULL::UUID,FALSE,'CONFIGURATION_VALUE_INVALID'; RETURN;
  END IF;
  BEGIN
    INSERT INTO public.locations(id,organization_id,name,code,address_text,timezone,currency,
      status,accepting_intake,updated_at)
    VALUES(p_location_id,p_organization_id,p_name,p_code,p_address_text,p_timezone,p_currency,
      'INACTIVE',FALSE,clock_timestamp());
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT NULL::UUID,FALSE,'LOCATION_CODE_CONFLICT'; RETURN;
  END;
  PERFORM public.management_location_append_audit(
    p_organization_id,p_location_id,p_actor_membership_id,'LOCATION_CREATED',
    jsonb_build_object('requestFingerprint',p_request_fingerprint,'status','INACTIVE',
      'acceptingIntake',FALSE),p_operation_id::text);
  RETURN QUERY SELECT p_location_id,TRUE,'OK';
END;
$$;

CREATE FUNCTION public.management_location_activate(
  p_actor_membership_id UUID,p_organization_id UUID,p_location_id UUID,p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ,changed BOOLEAN,result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3); v_exponent INTEGER;
BEGIN
  PERFORM public.management_location_lock(p_location_id,FALSE);
  PERFORM public.management_location_authorize_actor(p_actor_membership_id,p_organization_id);
  SELECT * INTO v FROM public.locations WHERE id=p_location_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v.status='ACTIVE' AND v.accepting_intake THEN RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN; END IF;
  IF v.status<>'INACTIVE' OR v.accepting_intake THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_INVALID_STATE'; RETURN; END IF;
  v_exponent := public.location_configuration_minor_unit_exponent(v.currency);
  IF v_exponent IS NULL OR v_exponent NOT BETWEEN 0 AND 3
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v.timezone) THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_NOT_READY'; RETURN;
  END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_LIFECYCLE_CONFLICT'; RETURN; END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.locations SET status='ACTIVE',accepting_intake=TRUE,updated_at=v_time WHERE id=p_location_id;
  PERFORM public.management_location_append_audit(p_organization_id,p_location_id,p_actor_membership_id,
    'LOCATION_ACTIVATED',jsonb_build_object('fromStatus','INACTIVE','toStatus','ACTIVE','acceptingIntake',TRUE));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

CREATE FUNCTION public.management_location_stop_intake(
  p_actor_membership_id UUID,p_organization_id UUID,p_location_id UUID,p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ,changed BOOLEAN,result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3);
BEGIN
  PERFORM public.management_location_lock(p_location_id,FALSE);
  PERFORM public.management_location_authorize_actor(p_actor_membership_id,p_organization_id);
  SELECT * INTO v FROM public.locations WHERE id=p_location_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v.status='ACTIVE' AND NOT v.accepting_intake THEN RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN; END IF;
  IF v.status<>'ACTIVE' THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_INVALID_STATE'; RETURN; END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_LIFECYCLE_CONFLICT'; RETURN; END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.locations SET accepting_intake=FALSE,updated_at=v_time WHERE id=p_location_id;
  PERFORM public.management_location_append_audit(p_organization_id,p_location_id,p_actor_membership_id,
    'LOCATION_INTAKE_STOPPED',jsonb_build_object('fromAcceptingIntake',TRUE,'toAcceptingIntake',FALSE));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

CREATE FUNCTION public.management_location_deactivate(
  p_actor_membership_id UUID,p_organization_id UUID,p_location_id UUID,p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ,changed BOOLEAN,result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3);
BEGIN
  PERFORM public.management_location_lock(p_location_id,FALSE);
  PERFORM public.management_location_authorize_actor(p_actor_membership_id,p_organization_id);
  SELECT * INTO v FROM public.locations WHERE id=p_location_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v.status='INACTIVE' AND NOT v.accepting_intake THEN RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN; END IF;
  IF v.status<>'ACTIVE' OR v.accepting_intake THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_INVALID_STATE'; RETURN; END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_LIFECYCLE_CONFLICT'; RETURN; END IF;
  IF public.management_location_has_blockers(p_organization_id,p_location_id) THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_DRAIN_BLOCKED'; RETURN; END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.locations SET status='INACTIVE',accepting_intake=FALSE,updated_at=v_time WHERE id=p_location_id;
  PERFORM public.management_location_append_audit(p_organization_id,p_location_id,p_actor_membership_id,
    'LOCATION_DEACTIVATED',jsonb_build_object('fromStatus','ACTIVE','toStatus','INACTIVE','acceptingIntake',FALSE));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

CREATE FUNCTION public.management_location_correct_currency(
  p_actor_membership_id UUID,p_organization_id UUID,p_location_id UUID,p_new_currency TEXT,p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ,changed BOOLEAN,result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3); v_exponent INTEGER; v_fee NUMERIC(14,3);
BEGIN
  PERFORM public.management_location_lock(p_location_id,FALSE);
  PERFORM public.management_settings_lock_organization(p_organization_id,FALSE);
  PERFORM public.management_location_authorize_actor(p_actor_membership_id,p_organization_id);
  SELECT l.*,COALESCE(l.valet_service_fee_override,o.valet_service_fee) AS effective_fee INTO v
    FROM public.locations l JOIN public.organizations o ON o.id=l.organization_id
    WHERE l.id=p_location_id AND l.organization_id=p_organization_id FOR UPDATE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v.currency=p_new_currency THEN RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN; END IF;
  IF v.status<>'INACTIVE' OR v.accepting_intake OR public.management_location_has_blockers(p_organization_id,p_location_id)
    THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_INVALID_STATE'; RETURN; END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_LIFECYCLE_CONFLICT'; RETURN; END IF;
  v_exponent:=public.location_configuration_minor_unit_exponent(p_new_currency); v_fee:=v.effective_fee;
  IF v_exponent IS NULL OR v_exponent NOT BETWEEN 0 AND 3
     OR NOT public.management_settings_fee_representable(p_new_currency,v_fee) THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'CONFIGURATION_VALUE_INVALID'; RETURN;
  END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.locations SET currency=p_new_currency,updated_at=v_time WHERE id=p_location_id;
  PERFORM public.management_location_append_audit(p_organization_id,p_location_id,p_actor_membership_id,
    'LOCATION_CURRENCY_CORRECTED',jsonb_build_object('previousCurrency',v.currency,'newCurrency',p_new_currency));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

CREATE FUNCTION public.management_location_correct_timezone(
  p_actor_membership_id UUID,p_organization_id UUID,p_location_id UUID,p_new_timezone TEXT,p_reason TEXT,p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ,changed BOOLEAN,result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3);
BEGIN
  PERFORM public.management_location_lock(p_location_id,FALSE);
  PERFORM public.management_location_authorize_actor(p_actor_membership_id,p_organization_id);
  SELECT * INTO v FROM public.locations WHERE id=p_location_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v.timezone=p_new_timezone THEN RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN; END IF;
  IF v.status<>'INACTIVE' OR v.accepting_intake OR public.management_location_has_blockers(p_organization_id,p_location_id)
    THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_INVALID_STATE'; RETURN; END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN QUERY SELECT v.updated_at,FALSE,'LOCATION_LIFECYCLE_CONFLICT'; RETURN; END IF;
  IF p_reason IS NULL OR p_new_timezone IS NULL OR btrim(p_reason)='' OR char_length(p_reason)>500 OR p_reason ~ '[[:cntrl:]]'
     OR char_length(p_new_timezone)>255
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_new_timezone) THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'CONFIGURATION_VALUE_INVALID'; RETURN;
  END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.locations SET timezone=p_new_timezone,updated_at=v_time WHERE id=p_location_id;
  PERFORM public.management_location_append_audit(p_organization_id,p_location_id,p_actor_membership_id,
    'LOCATION_TIMEZONE_CORRECTED',jsonb_build_object('previousTimezone',v.timezone,'newTimezone',p_new_timezone,'reason',p_reason));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.management_settings_authorize_actor(
  p_actor_membership_id UUID,p_organization_id UUID,p_location_id UUID DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.management_settings_lock_organization(p_organization_id,FALSE);
  PERFORM 1 FROM public.organization_memberships membership
    JOIN public.users actor ON actor.id=membership.user_id AND actor.status='ACTIVE'
    JOIN public.organizations organization ON organization.id=membership.organization_id AND organization.status='ACTIVE'
    WHERE membership.id=p_actor_membership_id AND membership.organization_id=p_organization_id
      AND membership.status='ACTIVE' AND membership.role='ORG_ADMIN'
    FOR UPDATE OF membership,organization;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF p_location_id IS NOT NULL THEN
    PERFORM 1 FROM public.locations WHERE id=p_location_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.management_location_lock(UUID,BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_authorize_actor(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_append_audit(UUID,UUID,UUID,TEXT,JSONB,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_guard_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_has_blockers(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_create(UUID,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_activate(UUID,UUID,UUID,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_stop_intake(UUID,UUID,UUID,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_deactivate(UUID,UUID,UUID,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_correct_currency(UUID,UUID,UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_location_correct_timezone(UUID,UUID,UUID,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_settings_authorize_actor(UUID,UUID,UUID) FROM PUBLIC;

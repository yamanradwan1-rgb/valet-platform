-- MGT-BE-08 / DEC-084: narrow Company Admin Visit Contact corrections.
CREATE INDEX customers_organization_phone_normalized_id_idx
ON public.customers(organization_id, phone_normalized, id);

CREATE INDEX customers_organization_display_name_prefix_id_idx
ON public.customers(organization_id, lower(display_name) text_pattern_ops, id);

CREATE INDEX valet_sessions_organization_customer_created_at_id_idx
ON public.valet_sessions(organization_id, customer_id, created_at DESC, id DESC);

CREATE FUNCTION public.management_visit_contact_authorize_actor(
  p_actor_membership_id UUID, p_organization_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_actor_membership_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  PERFORM 1
  FROM public.organization_memberships membership
  JOIN public.users actor
    ON actor.id=membership.user_id AND actor.status='ACTIVE'
  JOIN public.organizations organization
    ON organization.id=membership.organization_id AND organization.status='ACTIVE'
  WHERE membership.id=p_actor_membership_id
    AND membership.organization_id=p_organization_id
    AND membership.status='ACTIVE' AND membership.role='ORG_ADMIN'
  FOR UPDATE OF membership, organization;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
  END IF;
END;
$$;

CREATE FUNCTION public.management_visit_contact_append_audit(
  p_organization_id UUID, p_actor_membership_id UUID, p_customer_id UUID,
  p_event_type TEXT, p_metadata JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.audit_events(
    id, organization_id, location_id, valet_session_id, actor_membership_id,
    actor_type, event_type, entity_type, entity_id, metadata_json, occurred_at
  ) VALUES (
    gen_random_uuid(), p_organization_id, NULL, NULL, p_actor_membership_id,
    'MEMBERSHIP', p_event_type, 'Customer', p_customer_id, p_metadata,
    clock_timestamp()
  );
END;
$$;

CREATE FUNCTION public.management_visit_contact_guard_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.event_type IN ('VISIT_CONTACT_NAME_CORRECTED','VISIT_CONTACT_PHONE_CORRECTED')
     AND current_user <> (
       SELECT pg_get_userbyid(relowner) FROM pg_class
       WHERE oid='public.audit_events'::regclass
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_management_visit_contact_guard
BEFORE INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.management_visit_contact_guard_audit_event();

CREATE FUNCTION public.management_visit_contact_correct_name(
  p_actor_membership_id UUID, p_organization_id UUID, p_customer_id UUID,
  p_display_name TEXT, p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3);
BEGIN
  PERFORM public.management_visit_contact_authorize_actor(
    p_actor_membership_id, p_organization_id);
  IF p_customer_id IS NULL OR p_expected_updated_at IS NULL OR
     (p_display_name IS NOT NULL AND (
       btrim(p_display_name)='' OR char_length(p_display_name)>120 OR
       p_display_name ~ '[[:cntrl:]]')) THEN
    RETURN QUERY SELECT NULL::TIMESTAMPTZ,FALSE,'CONFIGURATION_VALUE_INVALID'; RETURN;
  END IF;
  SELECT * INTO v FROM public.customers
  WHERE id=p_customer_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'VERSION_CONFLICT'; RETURN;
  END IF;
  IF v.display_name IS NOT DISTINCT FROM p_display_name THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN;
  END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.customers SET display_name=p_display_name,updated_at=v_time
  WHERE id=p_customer_id AND organization_id=p_organization_id;
  PERFORM public.management_visit_contact_append_audit(
    p_organization_id,p_actor_membership_id,p_customer_id,
    'VISIT_CONTACT_NAME_CORRECTED',jsonb_build_object('field','displayName'));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

CREATE FUNCTION public.management_visit_contact_correct_phone(
  p_actor_membership_id UUID, p_organization_id UUID, p_customer_id UUID,
  p_phone_normalized TEXT, p_expected_updated_at TIMESTAMPTZ
) RETURNS TABLE(updated_at TIMESTAMPTZ, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v RECORD; v_time TIMESTAMPTZ(3);
BEGIN
  PERFORM public.management_visit_contact_authorize_actor(
    p_actor_membership_id, p_organization_id);
  IF p_customer_id IS NULL OR p_expected_updated_at IS NULL OR
     p_phone_normalized IS NULL OR p_phone_normalized !~ '^\+9627[0-9]{8}$' THEN
    RETURN QUERY SELECT NULL::TIMESTAMPTZ,FALSE,'CONFIGURATION_VALUE_INVALID'; RETURN;
  END IF;
  SELECT * INTO v FROM public.customers
  WHERE id=p_customer_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  IF v.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'VERSION_CONFLICT'; RETURN;
  END IF;
  IF v.phone_normalized=p_phone_normalized THEN
    RETURN QUERY SELECT v.updated_at,FALSE,'OK'; RETURN;
  END IF;
  v_time:=GREATEST(clock_timestamp(),v.updated_at+INTERVAL '0.001 second');
  UPDATE public.customers SET phone_normalized=p_phone_normalized,updated_at=v_time
  WHERE id=p_customer_id AND organization_id=p_organization_id;
  PERFORM public.management_visit_contact_append_audit(
    p_organization_id,p_actor_membership_id,p_customer_id,
    'VISIT_CONTACT_PHONE_CORRECTED',
    jsonb_build_object('field','phoneNormalized','normalizationVersion','JORDAN_MOBILE_V1'));
  RETURN QUERY SELECT v_time,TRUE,'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.management_visit_contact_authorize_actor(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_visit_contact_append_audit(UUID,UUID,UUID,TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_visit_contact_guard_audit_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_visit_contact_correct_name(UUID,UUID,UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_visit_contact_correct_phone(UUID,UUID,UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC;

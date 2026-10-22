-- #316: Narrow Management commands; no ordinary runtime UPDATE/INSERT on content.
BEGIN;

CREATE FUNCTION public.guest_information_authorize_actor(
  p_actor uuid, p_organization uuid, p_location uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_role public.membership_role;
BEGIN
  PERFORM public.management_settings_lock_organization(p_organization, false);
  SELECT member.role INTO v_role
  FROM public.organization_memberships AS member
  JOIN public.users AS usr ON usr.id = member.user_id AND usr.status = 'ACTIVE'
  JOIN public.organizations AS org
    ON org.id = member.organization_id AND org.status = 'ACTIVE'
  WHERE member.id = p_actor AND member.organization_id = p_organization
    AND member.status = 'ACTIVE'
    AND member.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
  FOR UPDATE OF member, org, usr;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTHORIZATION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_location IS NULL AND v_role <> 'ORG_ADMIN' THEN
    RAISE EXCEPTION 'AUTHORIZATION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_location IS NOT NULL THEN
    PERFORM 1 FROM public.locations AS loc
    WHERE loc.organization_id = p_organization AND loc.id = p_location
      AND loc.status = 'ACTIVE' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AUTHORIZATION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v_role = 'LOCATION_MANAGER' AND NOT EXISTS (
      SELECT 1 FROM public.membership_location_access AS scope
      WHERE scope.organization_id = p_organization
        AND scope.location_id = p_location
        AND scope.membership_id = p_actor
    ) THEN
      RAISE EXCEPTION 'AUTHORIZATION_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$function$;

CREATE FUNCTION public.guest_information_append_audit(
  p_actor uuid, p_organization uuid, p_location uuid,
  p_action text, p_revision integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
BEGIN
  INSERT INTO public.audit_events (
    id, organization_id, location_id, actor_membership_id, actor_type,
    event_type, entity_type, entity_id, metadata_json, occurred_at
  ) VALUES (
    gen_random_uuid(), p_organization, p_location, p_actor, 'MEMBERSHIP',
    'MANAGEMENT_GUEST_INFORMATION_CHANGED',
    CASE WHEN p_location IS NULL THEN 'Organization' ELSE 'Location' END,
    coalesce(p_location, p_organization),
    jsonb_build_object('scope', 'GUEST_INFORMATION',
      'operation', p_action, 'revision', p_revision),
    clock_timestamp()
  );
END;
$function$;

CREATE FUNCTION public.guest_information_save_privacy(
  p_actor uuid, p_organization uuid, p_location uuid,
  p_en_text text, p_en_url text, p_ar_text text, p_ar_url text,
  p_expected_revision integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_row public.guest_location_privacy%ROWTYPE;
  v_next integer;
BEGIN
  PERFORM public.guest_information_authorize_actor(p_actor, p_organization, p_location);
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'CONFIGURATION_VALUE_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.guest_location_privacy(organization_id,location_id)
  VALUES (p_organization,p_location) ON CONFLICT DO NOTHING;
  SELECT * INTO v_row FROM public.guest_location_privacy
  WHERE organization_id = p_organization AND location_id = p_location FOR UPDATE;
  IF v_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'CONFIGURATION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  v_next := v_row.revision + 1;
  UPDATE public.guest_location_privacy
  SET draft_en_text = nullif(p_en_text, ''),
      draft_en_url = nullif(p_en_url, ''),
      draft_ar_text = nullif(p_ar_text, ''),
      draft_ar_url = nullif(p_ar_url, ''),
      revision = v_next,
      updated_at = greatest(clock_timestamp(), v_row.updated_at + interval '1 millisecond')
  WHERE organization_id = p_organization AND location_id = p_location;
  PERFORM public.guest_information_append_audit(
    p_actor,p_organization,p_location,'PRIVACY_DRAFT_SAVED',v_next);
  RETURN v_next;
END;
$function$;

CREATE FUNCTION public.guest_information_publish_privacy(
  p_actor uuid, p_organization uuid, p_location uuid,
  p_expected_revision integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_row public.guest_location_privacy%ROWTYPE;
  v_version integer;
  v_next integer;
BEGIN
  PERFORM public.guest_information_authorize_actor(p_actor,p_organization,p_location);
  SELECT * INTO v_row FROM public.guest_location_privacy
  WHERE organization_id = p_organization AND location_id = p_location FOR UPDATE;
  IF NOT FOUND OR v_row.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'CONFIGURATION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF coalesce(btrim(v_row.draft_en_text),'') = ''
     AND coalesce(btrim(v_row.draft_en_url),'') = ''
     AND coalesce(btrim(v_row.draft_ar_text),'') = ''
     AND coalesce(btrim(v_row.draft_ar_url),'') = '' THEN
    RAISE EXCEPTION 'CONFIGURATION_VALUE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(max(version),0)+1 INTO v_version
  FROM public.guest_privacy_publications
  WHERE organization_id = p_organization AND location_id = p_location;
  INSERT INTO public.guest_privacy_publications(
    organization_id,location_id,version,en_text,en_url,ar_text,ar_url
  ) VALUES (
    p_organization,p_location,v_version,
    nullif(v_row.draft_en_text,''),nullif(v_row.draft_en_url,''),
    nullif(v_row.draft_ar_text,''),nullif(v_row.draft_ar_url,'')
  );
  v_next := v_row.revision + 1;
  UPDATE public.guest_location_privacy
  SET published_version = v_version, revision = v_next,
      updated_at = greatest(clock_timestamp(), v_row.updated_at + interval '1 millisecond')
  WHERE organization_id = p_organization AND location_id = p_location;
  PERFORM public.guest_information_append_audit(
    p_actor,p_organization,p_location,'PRIVACY_PUBLISHED',v_next);
  RETURN v_next;
END;
$function$;

CREATE FUNCTION public.guest_information_unpublish_privacy(
  p_actor uuid, p_organization uuid, p_location uuid,
  p_expected_revision integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_row public.guest_location_privacy%ROWTYPE;
  v_next integer;
BEGIN
  PERFORM public.guest_information_authorize_actor(p_actor,p_organization,p_location);
  SELECT * INTO v_row FROM public.guest_location_privacy
  WHERE organization_id = p_organization AND location_id = p_location FOR UPDATE;
  IF NOT FOUND OR v_row.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'CONFIGURATION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF v_row.published_version IS NULL THEN RETURN v_row.revision; END IF;
  v_next := v_row.revision + 1;
  UPDATE public.guest_location_privacy
  SET published_version = NULL, revision = v_next,
      updated_at = greatest(clock_timestamp(), v_row.updated_at + interval '1 millisecond')
  WHERE organization_id = p_organization AND location_id = p_location;
  PERFORM public.guest_information_append_audit(
    p_actor,p_organization,p_location,'PRIVACY_UNPUBLISHED',v_next);
  RETURN v_next;
END;
$function$;

CREATE FUNCTION public.guest_information_set_company_contact(
  p_actor uuid, p_organization uuid,
  p_display_name text, p_phone text, p_support_url text,
  p_hours text, p_hours_confirmed boolean, p_expected_revision integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_row public.guest_contact_company_defaults%ROWTYPE;
  v_next integer;
BEGIN
  PERFORM public.guest_information_authorize_actor(p_actor,p_organization,NULL);
  IF p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_hours_confirmed IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_VALUE_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.guest_contact_company_defaults(organization_id)
  VALUES (p_organization) ON CONFLICT DO NOTHING;
  SELECT * INTO v_row FROM public.guest_contact_company_defaults
  WHERE organization_id = p_organization FOR UPDATE;
  IF v_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'CONFIGURATION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  v_next := v_row.revision + 1;
  UPDATE public.guest_contact_company_defaults
  SET display_name = p_display_name, phone = p_phone,
      support_url = p_support_url, hours = p_hours,
      hours_confirmed = p_hours_confirmed, revision = v_next,
      updated_at = greatest(clock_timestamp(), v_row.updated_at + interval '1 millisecond')
  WHERE organization_id = p_organization;
  PERFORM public.guest_information_append_audit(
    p_actor,p_organization,NULL,'CONTACT_COMPANY_DEFAULTS_SAVED',v_next);
  RETURN v_next;
END;
$function$;

CREATE FUNCTION public.guest_information_set_location_contact(
  p_actor uuid, p_organization uuid, p_location uuid,
  p_display_mode public.guest_contact_field_mode, p_display_name text,
  p_phone_mode public.guest_contact_field_mode, p_phone text,
  p_url_mode public.guest_contact_field_mode, p_support_url text,
  p_hours_mode public.guest_contact_field_mode, p_hours text,
  p_hours_confirmed boolean, p_expected_revision integer
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $function$
DECLARE
  v_row public.guest_contact_location_overrides%ROWTYPE;
  v_next integer;
BEGIN
  PERFORM public.guest_information_authorize_actor(p_actor,p_organization,p_location);
  IF p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_display_mode IS NULL OR p_phone_mode IS NULL
    OR p_url_mode IS NULL OR p_hours_mode IS NULL
    OR p_hours_confirmed IS NULL THEN
    RAISE EXCEPTION 'CONFIGURATION_VALUE_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.guest_contact_location_overrides(organization_id,location_id)
  VALUES (p_organization,p_location) ON CONFLICT DO NOTHING;
  SELECT * INTO v_row FROM public.guest_contact_location_overrides
  WHERE organization_id = p_organization AND location_id = p_location FOR UPDATE;
  IF v_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'CONFIGURATION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  v_next := v_row.revision + 1;
  UPDATE public.guest_contact_location_overrides
  SET display_name_mode = p_display_mode, display_name = p_display_name,
      phone_mode = p_phone_mode, phone = p_phone,
      support_url_mode = p_url_mode, support_url = p_support_url,
      hours_mode = p_hours_mode, hours = p_hours,
      hours_confirmed = p_hours_confirmed, revision = v_next,
      updated_at = greatest(clock_timestamp(), v_row.updated_at + interval '1 millisecond')
  WHERE organization_id = p_organization AND location_id = p_location;
  PERFORM public.guest_information_append_audit(
    p_actor,p_organization,p_location,'CONTACT_LOCATION_OVERRIDE_SAVED',v_next);
  RETURN v_next;
END;
$function$;

REVOKE ALL ON FUNCTION public.guest_information_authorize_actor(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_append_audit(uuid,uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_save_privacy(
  uuid,uuid,uuid,text,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_publish_privacy(uuid,uuid,uuid,integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_unpublish_privacy(uuid,uuid,uuid,integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_set_company_contact(
  uuid,uuid,text,text,text,text,boolean,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_information_set_location_contact(
  uuid,uuid,uuid,guest_contact_field_mode,text,guest_contact_field_mode,text,
  guest_contact_field_mode,text,guest_contact_field_mode,text,boolean,integer) FROM PUBLIC;
COMMIT;

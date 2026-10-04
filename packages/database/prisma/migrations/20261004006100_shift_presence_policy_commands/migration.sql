BEGIN;
-- GPS-B does not activate strict production policy. No environment toggle.
ALTER TABLE public.organizations DROP CONSTRAINT organizations_presence_gps_a_off,
  ADD CONSTRAINT organizations_presence_strict_release_closed CHECK
    (shift_start_presence_mode IN ('OFF','WARN_ONLY') AND shift_end_presence_mode IN ('OFF','WARN_ONLY'));
ALTER TABLE public.locations DROP CONSTRAINT locations_presence_gps_a_off,
  ADD CONSTRAINT locations_presence_strict_release_closed CHECK
    ((shift_start_presence_mode_override IS NULL OR shift_start_presence_mode_override IN ('OFF','WARN_ONLY'))
     AND (shift_end_presence_mode_override IS NULL OR shift_end_presence_mode_override IN ('OFF','WARN_ONLY')));

CREATE FUNCTION public.shift_presence_set_policy(
  p_user UUID,p_member UUID,p_session UUID,p_access_hash TEXT,
  p_organization UUID,p_location UUID,p_field TEXT,p_value TEXT,p_clear BOOLEAN,
  p_revision INTEGER,p_company_revision INTEGER,p_mutation UUID
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_role public.membership_role; v_column TEXT; v_revision INTEGER; v_old TEXT;
  v_company_revision INTEGER; v_now TIMESTAMPTZ:=clock_timestamp(); v_target UUID;
BEGIN
  IF p_revision IS NULL OR p_revision<1 OR p_mutation IS NULL OR
     p_field NOT IN ('shiftStartPresenceMode','shiftEndPresenceMode','shiftPresenceMaxAccuracyMeters','shiftPresenceMaxFixAgeSeconds')
     OR (p_location IS NULL AND p_clear) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Presence policy request invalid.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('management-settings-org:'||p_organization::text,0));
  IF p_location IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('location-lifecycle:'||p_location::text,0));
  END IF;
  PERFORM s.id FROM public.staff_auth_sessions s JOIN public.users u ON u.id=s.user_id
    WHERE s.id=p_session AND s.user_id=p_user AND s.current_access_token_hash=p_access_hash
      AND s.revoked_at IS NULL AND u.status='ACTIVE' AND clock_timestamp()<s.access_expires_at
      AND clock_timestamp()<s.absolute_expires_at FOR UPDATE OF s,u;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence authority unavailable.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('staff-management-org:'||p_organization::text,0));
  SELECT m.role INTO v_role FROM public.organization_memberships m
    WHERE m.id=p_member AND m.user_id=p_user AND m.organization_id=p_organization AND m.status='ACTIVE'
      AND m.role IN ('ORG_ADMIN','LOCATION_MANAGER') FOR UPDATE;
  IF NOT FOUND OR (p_location IS NULL AND v_role<>'ORG_ADMIN') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence authority unavailable.';
  END IF;
  PERFORM o.id FROM public.organizations o JOIN public.organization_subscriptions s ON s.organization_id=o.id
    WHERE o.id=p_organization AND o.status='ACTIVE' AND s.dashboard_access_enabled FOR SHARE OF o,s;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence authority unavailable.'; END IF;
  IF p_location IS NOT NULL THEN
    PERFORM id FROM public.locations WHERE id=p_location AND organization_id=p_organization
      AND (v_role='ORG_ADMIN' OR status='ACTIVE') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence authority unavailable.'; END IF;
    IF v_role='LOCATION_MANAGER' THEN
      PERFORM location_id FROM public.membership_location_access WHERE organization_id=p_organization
        AND membership_id=p_member AND location_id=p_location FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence authority unavailable.'; END IF;
    END IF;
  END IF;
  PERFORM f.id FROM public.user_mfa_totp_factors f JOIN public.staff_auth_sessions s ON s.mfa_factor_id=f.id
    WHERE s.id=p_session AND f.user_id=p_user AND f.state='ACTIVE' FOR SHARE OF f;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence assurance unavailable.'; END IF;
  v_now:=clock_timestamp();
  PERFORM id FROM public.staff_auth_sessions WHERE id=p_session AND user_id=p_user
    AND current_access_token_hash=p_access_hash AND revoked_at IS NULL AND v_now<access_expires_at AND v_now<absolute_expires_at
    AND mfa_authenticated_at<=v_now AND v_now<=mfa_authenticated_at+INTERVAL '5 minutes'
    AND last_admin_activity_at<=v_now AND v_now<last_admin_activity_at+INTERVAL '30 minutes';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Presence assurance unavailable.'; END IF;
  SELECT shift_presence_revision INTO v_company_revision FROM public.organizations WHERE id=p_organization;
  IF p_location IS NOT NULL AND v_company_revision IS DISTINCT FROM p_company_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Presence inherited context conflict.';
  END IF;
  v_column:=CASE p_field WHEN 'shiftStartPresenceMode' THEN 'shift_start_presence_mode'
    WHEN 'shiftEndPresenceMode' THEN 'shift_end_presence_mode'
    WHEN 'shiftPresenceMaxAccuracyMeters' THEN 'shift_presence_max_accuracy_meters'
    ELSE 'shift_presence_max_fix_age_seconds' END;
  v_target:=coalesce(p_location,p_organization);
  IF p_location IS NOT NULL THEN v_column:=v_column||'_override'; END IF;
  EXECUTE format('SELECT %I::text,shift_presence_revision FROM public.%I WHERE id=$1',v_column,
    CASE WHEN p_location IS NULL THEN 'organizations' ELSE 'locations' END) INTO v_old,v_revision USING v_target;
  IF v_revision IS DISTINCT FROM p_revision THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Presence revision conflict.';
  END IF;
  IF p_clear THEN p_value:=NULL; END IF;
  IF v_old IS NOT DISTINCT FROM p_value THEN RETURN v_revision; END IF;
  IF p_field IN ('shiftStartPresenceMode','shiftEndPresenceMode') THEN
    IF p_value IS NOT NULL AND p_value NOT IN ('OFF','WARN_ONLY') THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence strict rollout closed.';
    END IF;
    EXECUTE format('UPDATE public.%I SET %I=$1::public.shift_presence_mode WHERE id=$2 RETURNING shift_presence_revision',
      CASE WHEN p_location IS NULL THEN 'organizations' ELSE 'locations' END,v_column) INTO v_revision USING p_value,v_target;
  ELSE
    EXECUTE format('UPDATE public.%I SET %I=$1::integer WHERE id=$2 RETURNING shift_presence_revision',
      CASE WHEN p_location IS NULL THEN 'organizations' ELSE 'locations' END,v_column) INTO v_revision USING p_value,v_target;
  END IF;
  INSERT INTO public.audit_events(id,organization_id,location_id,actor_membership_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
    VALUES(p_mutation,p_organization,p_location,p_member,'MEMBERSHIP',
      CASE WHEN p_location IS NULL THEN 'SHIFT_PRESENCE_COMPANY_POLICY_CHANGED' ELSE 'SHIFT_PRESENCE_LOCATION_POLICY_CHANGED' END,
      CASE WHEN p_location IS NULL THEN 'Organization' ELSE 'Location' END,v_target,
      jsonb_build_object('field',p_field,'operation',CASE WHEN p_clear THEN 'CLEAR' ELSE 'SET' END,'revision',v_revision),clock_timestamp());
  RETURN v_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.shift_presence_set_policy(UUID,UUID,UUID,TEXT,UUID,UUID,TEXT,TEXT,BOOLEAN,INTEGER,INTEGER,UUID) FROM PUBLIC;
COMMIT;

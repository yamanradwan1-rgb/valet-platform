-- Keep the deployed function signatures and ACLs. The TEXT bearer arguments
-- retain their historic names, but now carry the raw bearer and are hashed
-- inside these SECURITY DEFINER writers.
CREATE OR REPLACE FUNCTION public.shift_presence_set_policy(
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
    WHERE s.id=p_session AND s.user_id=p_user
      AND s.current_access_token_hash='staff-access-sha256:v1:'||pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_access_hash,'UTF8')),'hex')
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
    AND current_access_token_hash='staff-access-sha256:v1:'||pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_access_hash,'UTF8')),'hex')
    AND revoked_at IS NULL AND v_now<access_expires_at AND v_now<absolute_expires_at
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
    IF p_value IS NOT NULL AND p_value NOT IN ('OFF','WARN_ONLY','REQUIRE','REQUIRE_OR_OVERRIDE') THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence policy mode invalid.';
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

CREATE OR REPLACE FUNCTION public.staff_shift_force_end(
  p_user_id UUID, p_session_id UUID, p_access_hash TEXT,
  p_organization_id UUID, p_shift_id UUID, p_operation_id UUID,
  p_fingerprint TEXT, p_confirmation TEXT, p_reason TEXT
) RETURNS TABLE(operation_id UUID, shift_id UUID, membership_id UUID,
                location_id UUID, started_at TIMESTAMPTZ(3), ended_at TIMESTAMPTZ(3))
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_session public.staff_auth_sessions%ROWTYPE;
  v_actor UUID;
  v_role public.membership_role;
  v_shift public.shifts%ROWTYPE;
  v_prior public.shift_force_end_closures%ROWTYPE;
  v_now TIMESTAMPTZ(3);
  v_reason TEXT;
  v_units INTEGER;
BEGIN
  SELECT session.* INTO v_session
  FROM public.staff_auth_sessions session JOIN public.users u ON u.id=session.user_id
  WHERE session.id=p_session_id AND session.user_id=p_user_id
    AND session.current_access_token_hash='staff-access-sha256:v1:'||pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_access_hash,'UTF8')),'hex')
    AND session.revoked_at IS NULL
    AND clock_timestamp()<session.access_expires_at
    AND clock_timestamp()<session.absolute_expires_at AND u.status='ACTIVE'
  FOR UPDATE OF session,u;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='STAFF_SESSION_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('staff-management-org:' || p_organization_id::text,0));
  SELECT m.id,m.role INTO v_actor,v_role FROM public.organization_memberships m
  WHERE m.organization_id=p_organization_id AND m.user_id=p_user_id
    AND m.status='ACTIVE' AND m.role IN ('ORG_ADMIN','LOCATION_MANAGER') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  PERFORM 1 FROM public.organizations WHERE id=p_organization_id AND status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  PERFORM 1 FROM public.organization_subscriptions
    WHERE organization_id=p_organization_id AND dashboard_access_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  PERFORM 1 FROM public.user_mfa_totp_factors
    WHERE id=v_session.mfa_factor_id AND user_id=p_user_id AND state='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='MFA_STEP_UP_REQUIRED'; END IF;

  SELECT s.* INTO v_shift FROM public.shifts s
    WHERE s.id=p_shift_id AND s.organization_id=p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v_role='LOCATION_MANAGER' THEN
    PERFORM 1 FROM public.membership_location_access a JOIN public.locations l
      ON l.id=a.location_id AND l.organization_id=a.organization_id
    WHERE a.organization_id=p_organization_id AND a.membership_id=v_actor
      AND a.location_id=v_shift.location_id AND l.status='ACTIVE'
    FOR SHARE OF a,l;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  END IF;
  SELECT s.* INTO v_shift FROM public.shifts s
    WHERE s.id=p_shift_id AND s.organization_id=p_organization_id
      AND s.location_id=v_shift.location_id AND s.membership_id=v_shift.membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  v_now := clock_timestamp();
  IF v_session.mfa_authenticated_at IS NULL OR v_session.last_admin_activity_at IS NULL
    OR v_now<v_session.mfa_authenticated_at OR v_now<v_session.last_admin_activity_at
    OR v_now>=v_session.mfa_authenticated_at+INTERVAL '8 hours'
    OR v_now>=v_session.last_admin_activity_at+INTERVAL '30 minutes'
    OR v_now>v_session.mfa_authenticated_at+INTERVAL '5 minutes'
    OR v_now>=v_session.access_expires_at OR v_now>=v_session.absolute_expires_at
  THEN RAISE EXCEPTION USING MESSAGE='MFA_STEP_UP_REQUIRED'; END IF;

  v_reason := btrim(p_reason,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  SELECT char_length(v_reason)+count(*) FILTER (WHERE ascii(c)>65535) INTO v_units
    FROM regexp_split_to_table(v_reason,'') AS c;
  IF p_operation_id IS NULL OR p_confirmation IS DISTINCT FROM 'FORCE_END_SHIFT'
    OR v_reason IS NULL OR p_reason IS DISTINCT FROM v_reason OR v_units NOT BETWEEN 1 AND 500
    OR p_fingerprint IS DISTINCT FROM encode(sha256(convert_to(
      'staff-shift-force-end:v1' || E'\n' || p_organization_id::text || E'\n' ||
      p_shift_id::text || E'\nFORCE_END_SHIFT\n' || v_reason,'UTF8')),'hex')
  THEN RAISE EXCEPTION USING MESSAGE='FORCE_END_REQUEST_INVALID'; END IF;

  SELECT c.* INTO v_prior FROM public.shift_force_end_closures c
    WHERE c.organization_id=p_organization_id AND c.operation_id=p_operation_id;
  IF FOUND THEN
    IF v_prior.shift_id<>p_shift_id OR v_prior.request_fingerprint<>p_fingerprint THEN
      RAISE EXCEPTION USING MESSAGE='IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_prior.operation_id,v_shift.id,v_shift.membership_id,
      v_shift.location_id,v_shift.started_at,v_prior.ended_at;
    RETURN;
  END IF;
  IF v_shift.status='ENDED' THEN RAISE EXCEPTION USING MESSAGE='SHIFT_ALREADY_ENDED'; END IF;
  PERFORM 1 FROM public.tasks task WHERE task.organization_id=p_organization_id
    AND task.location_id=v_shift.location_id AND task.current_assignee_membership_id=v_shift.membership_id
    AND task.status IN ('ASSIGNED','ACCEPTED','IN_PROGRESS') LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION USING MESSAGE='OPEN_TASK_HANDOFF_REQUIRED'; END IF;

  UPDATE public.shifts SET status='ENDED',ended_at=v_now
    WHERE id=p_shift_id AND organization_id=p_organization_id AND status='ACTIVE';
  INSERT INTO public.shift_force_end_closures
    (shift_id,organization_id,actor_membership_id,operation_id,request_fingerprint,ended_at,created_at)
    VALUES(p_shift_id,p_organization_id,v_actor,p_operation_id,p_fingerprint,v_now,v_now);
  INSERT INTO public.audit_events
    (id,organization_id,location_id,actor_membership_id,actor_type,event_type,
     entity_type,entity_id,metadata_json,occurred_at)
    VALUES(gen_random_uuid(),p_organization_id,v_shift.location_id,v_actor,'MEMBERSHIP',
      'SHIFT_FORCE_ENDED','Shift',p_shift_id,jsonb_build_object(
        'fromStatus','ACTIVE','toStatus','ENDED','closureKind','ADMIN_FORCE_END',
        'cashReconciliationState','PENDING','targetMembershipId',v_shift.membership_id,
        'operationId',p_operation_id,'reason',v_reason),v_now);
  RETURN QUERY SELECT p_operation_id,v_shift.id,v_shift.membership_id,
    v_shift.location_id,v_shift.started_at,v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_presence_set_policy(
  UUID,UUID,UUID,TEXT,UUID,UUID,TEXT,TEXT,BOOLEAN,INTEGER,INTEGER,UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_shift_force_end(
  UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT
) FROM PUBLIC;

-- Keep the existing entitlement lock callable by Runtime, but bind it to the
-- original bearer. The caller already holds the exact session/User lock.
CREATE OR REPLACE FUNCTION public.shift_presence_lock_management_entitlement(
  p_user uuid,
  p_session uuid,
  p_hash text,
  p_organization uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $presence_entitlement$
DECLARE
  v_enabled boolean;
BEGIN
  -- p_hash retains its deployed argument name; it now carries the raw bearer.
  IF p_hash IS NULL OR p_hash !~ '^vsa1[.][A-Za-z0-9_-]{43}$'
     OR NOT EXISTS (
       SELECT 1
       FROM public.staff_auth_sessions AS session
       INNER JOIN public.users AS staff_user
         ON staff_user.id = session.user_id AND staff_user.status = 'ACTIVE'
       INNER JOIN public.organization_memberships AS membership
         ON membership.user_id = staff_user.id
        AND membership.organization_id = p_organization
        AND membership.status = 'ACTIVE'
        AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
       WHERE session.id = p_session
         AND session.user_id = p_user
         AND session.current_access_token_hash =
           'staff-access-sha256:v1:' || pg_catalog.encode(
             pg_catalog.sha256(pg_catalog.convert_to(p_hash, 'UTF8')),
             'hex'
           )
         AND session.revoked_at IS NULL
         AND pg_catalog.clock_timestamp() < session.access_expires_at
         AND pg_catalog.clock_timestamp() < session.absolute_expires_at
     ) THEN
    RETURN false;
  END IF;

  SELECT subscription.dashboard_access_enabled INTO v_enabled
  FROM public.organization_subscriptions AS subscription
  WHERE subscription.organization_id = p_organization
  FOR SHARE;
  RETURN COALESCE(v_enabled, false);
END;
$presence_entitlement$;

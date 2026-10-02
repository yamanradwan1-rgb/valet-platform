-- Issue #240 / T05-F: administrative closure, never employee cash reporting.
CREATE UNIQUE INDEX shifts_organization_id_id_key ON public.shifts(organization_id,id);

CREATE TABLE public.shift_force_end_closures (
  shift_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_membership_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  ended_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shift_force_end_closures_org_operation_key UNIQUE(organization_id,operation_id),
  CONSTRAINT shift_force_end_closures_org_shift_key UNIQUE(organization_id,shift_id),
  CONSTRAINT shift_force_end_closures_shift_fkey FOREIGN KEY(organization_id,shift_id)
    REFERENCES public.shifts(organization_id,id) ON DELETE RESTRICT,
  CONSTRAINT shift_force_end_closures_actor_fkey FOREIGN KEY(organization_id,actor_membership_id)
    REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT
);
REVOKE ALL ON TABLE public.shift_force_end_closures FROM PUBLIC;

CREATE UNIQUE INDEX audit_events_shift_force_ended_key
  ON public.audit_events(organization_id,entity_id)
  WHERE event_type='SHIFT_FORCE_ENDED';

CREATE FUNCTION public.staff_shift_force_end_guard_history() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'shift_force_end_closures' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Shift administrative closure is immutable.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shift_force_end_closures c WHERE c.shift_id=OLD.id)
    AND (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
      OR NEW.started_at IS DISTINCT FROM OLD.started_at
      OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
      OR NEW.cash_expected IS DISTINCT FROM OLD.cash_expected
      OR NEW.cash_reported IS DISTINCT FROM OLD.cash_reported
      OR NEW.cash_variance IS DISTINCT FROM OLD.cash_variance
      OR NEW.cash_currency IS DISTINCT FROM OLD.cash_currency
      OR NEW.cash_reported_at IS DISTINCT FROM OLD.cash_reported_at
      OR NEW.cash_reported_by_membership_id IS DISTINCT FROM OLD.cash_reported_by_membership_id)
  THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Shift administrative closure is immutable.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_force_end_closures_immutable BEFORE UPDATE OR DELETE
  ON public.shift_force_end_closures FOR EACH ROW
  EXECUTE FUNCTION public.staff_shift_force_end_guard_history();
CREATE TRIGGER shifts_force_end_immutable BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.staff_shift_force_end_guard_history();

CREATE FUNCTION public.staff_shift_force_end_guard_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.event_type <> 'SHIFT_FORCE_ENDED' THEN RETURN NEW; END IF;
  IF NEW.entity_type <> 'Shift' OR NEW.valet_session_id IS NOT NULL
    OR NEW.actor_type IS DISTINCT FROM 'MEMBERSHIP'::public.audit_actor_type
    OR NEW.controlled_operator_ref IS NOT NULL
    OR (SELECT count(*) FROM jsonb_object_keys(NEW.metadata_json)) <> 7
    OR NOT EXISTS (
      SELECT 1 FROM public.shift_force_end_closures c
      JOIN public.shifts s ON s.id=c.shift_id AND s.organization_id=c.organization_id
      WHERE c.shift_id=NEW.entity_id AND c.organization_id=NEW.organization_id
        AND c.actor_membership_id=NEW.actor_membership_id
        AND s.location_id=NEW.location_id AND c.ended_at=NEW.occurred_at
        AND s.status='ENDED' AND s.ended_at=c.ended_at
        AND NEW.metadata_json @> jsonb_build_object(
          'fromStatus','ACTIVE','toStatus','ENDED','closureKind','ADMIN_FORCE_END',
          'cashReconciliationState','PENDING','targetMembershipId',s.membership_id,
          'operationId',c.operation_id)
        AND jsonb_typeof(NEW.metadata_json->'reason')='string'
        AND c.request_fingerprint=encode(sha256(convert_to(
          'staff-shift-force-end:v1' || E'\n' || c.organization_id::text || E'\n' ||
          c.shift_id::text || E'\nFORCE_END_SHIFT\n' || (NEW.metadata_json->>'reason'),'UTF8')),'hex')
    ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_events_force_end_guard BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.staff_shift_force_end_guard_audit();

CREATE FUNCTION public.staff_shift_force_end(
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
  -- The same session/User lock as requireMfaAssuranceInTransaction; held until commit.
  SELECT session.* INTO v_session
  FROM public.staff_auth_sessions session JOIN public.users u ON u.id=session.user_id
  WHERE session.id=p_session_id AND session.user_id=p_user_id
    AND session.current_access_token_hash=p_access_hash AND session.revoked_at IS NULL
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

  -- Resolve scope before target lock/state/replay disclosure. No target staff-coverage rule.
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
  -- Zod's existing reason convention bounds UTF-16 code units, including astral text.
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
  -- Never take Task locks here: assignment holds Task UPDATE then Shift SHARE.
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
REVOKE ALL ON FUNCTION public.staff_shift_force_end_guard_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_shift_force_end_guard_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_shift_force_end(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT) FROM PUBLIC;

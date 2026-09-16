ALTER TABLE public.organization_memberships
ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.organization_memberships
ADD CONSTRAINT organization_memberships_version_check CHECK (version >= 1);

CREATE INDEX organization_memberships_org_created_id_idx
ON public.organization_memberships(organization_id, created_at, id);

CREATE INDEX valet_sessions_checked_in_state_location_idx
ON public.valet_sessions(checked_in_by_membership_id, state, location_id);

CREATE INDEX incident_recovery_intents_member_state_expiry_location_idx
ON public.incident_recovery_intents(reporting_membership_id, state, expires_at, location_id);

CREATE FUNCTION public.staff_management_authorize_actor(
    p_actor_membership_id UUID,
    p_organization_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('staff-management-org:' || p_organization_id::text, 0)
    );
    PERFORM 1 FROM public.organizations AS organization
    WHERE organization.id = p_organization_id AND organization.status = 'ACTIVE';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;

    PERFORM 1
    FROM public.organization_memberships AS membership
    INNER JOIN public.users AS actor ON actor.id = membership.user_id
    WHERE membership.id = p_actor_membership_id
      AND membership.organization_id = p_organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'ORG_ADMIN'
      AND actor.status = 'ACTIVE'
    FOR UPDATE OF membership;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;
END;
$$;

CREATE FUNCTION public.staff_management_has_blockers(
    p_organization_id UUID,
    p_membership_id UUID,
    p_location_ids UUID[] DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.shifts AS shift_row
      WHERE shift_row.organization_id = p_organization_id
        AND shift_row.membership_id = p_membership_id
        AND shift_row.status = 'ACTIVE'
        AND (p_location_ids IS NULL OR shift_row.location_id = ANY(p_location_ids))
    ) OR EXISTS (
      SELECT 1 FROM public.tasks AS task
      WHERE task.organization_id = p_organization_id
        AND task.current_assignee_membership_id = p_membership_id
        AND task.status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
        AND (p_location_ids IS NULL OR task.location_id = ANY(p_location_ids))
    ) OR EXISTS (
      SELECT 1 FROM public.valet_sessions AS session
      WHERE session.organization_id = p_organization_id
        AND session.checked_in_by_membership_id = p_membership_id
        AND (p_location_ids IS NULL OR session.location_id = ANY(p_location_ids))
        AND (
          session.state = 'CHECKING_IN'
          OR (
            session.state = 'AWAITING_PARKING'
            AND NOT EXISTS (
              SELECT 1 FROM public.tasks AS parking_task
              WHERE parking_task.organization_id = session.organization_id
                AND parking_task.location_id = session.location_id
                AND parking_task.valet_session_id = session.id
                AND parking_task.task_type = 'PARKING'
                AND parking_task.status IN ('QUEUED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')
            )
          )
        )
    ) OR EXISTS (
      SELECT 1 FROM public.incident_recovery_intents AS intent
      WHERE intent.organization_id = p_organization_id
        AND intent.reporting_membership_id = p_membership_id
        AND intent.state = 'RESERVED'
        AND intent.expires_at > clock_timestamp()
        AND (p_location_ids IS NULL OR intent.location_id = ANY(p_location_ids))
    )
$$;

CREATE FUNCTION public.staff_management_is_usable_admin(
    p_organization_id UUID,
    p_membership_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      INNER JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
      INNER JOIN public.users AS staff_user ON staff_user.id = membership.user_id
      WHERE membership.id = p_membership_id
        AND membership.organization_id = p_organization_id
        AND membership.status = 'ACTIVE'
        AND membership.role = 'ORG_ADMIN'
        AND organization.status = 'ACTIVE'
        AND staff_user.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM public.user_mfa_totp_factors AS factor
          WHERE factor.user_id = membership.user_id AND factor.state = 'ACTIVE'
        )
    )
$$;

CREATE FUNCTION public.staff_management_has_other_usable_admin(
    p_organization_id UUID,
    p_membership_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      INNER JOIN public.users AS staff_user ON staff_user.id = membership.user_id
      WHERE membership.organization_id = p_organization_id
        AND membership.id <> p_membership_id
        AND membership.status = 'ACTIVE'
        AND membership.role = 'ORG_ADMIN'
        AND staff_user.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM public.user_mfa_totp_factors AS factor
          WHERE factor.user_id = membership.user_id AND factor.state = 'ACTIVE'
        )
    )
$$;

CREATE FUNCTION public.staff_management_lock_admin_factors(
    p_organization_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    PERFORM factor.id
    FROM public.organization_memberships AS membership
    INNER JOIN public.users AS staff_user ON staff_user.id = membership.user_id
    INNER JOIN public.user_mfa_totp_factors AS factor ON factor.user_id = membership.user_id
    WHERE membership.organization_id = p_organization_id
      AND membership.status = 'ACTIVE'
      AND membership.role = 'ORG_ADMIN'
      AND staff_user.status = 'ACTIVE'
      AND factor.state = 'ACTIVE'
    ORDER BY factor.id
    FOR SHARE OF factor;
END;
$$;

CREATE FUNCTION public.staff_management_set_role(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_membership_id UUID,
    p_expected_version INTEGER,
    p_role public.membership_role
) RETURNS TABLE(version INTEGER, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    target RECORD;
BEGIN
    PERFORM public.staff_management_authorize_actor(p_actor_membership_id, p_organization_id);
    SELECT membership.role, membership.status, membership.version, membership.user_id,
           staff_user.status AS user_status
      INTO target
      FROM public.organization_memberships AS membership
      INNER JOIN public.users AS staff_user ON staff_user.id = membership.user_id
      WHERE membership.id = p_membership_id
        AND membership.organization_id = p_organization_id
      FOR UPDATE OF membership;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED'; END IF;
    IF target.role = p_role THEN RETURN QUERY SELECT target.version, FALSE, 'OK'::TEXT; RETURN; END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version
    THEN RETURN QUERY SELECT target.version, FALSE, 'VERSION_CONFLICT'::TEXT; RETURN; END IF;
    IF target.role = 'ORG_ADMIN' AND p_role <> 'ORG_ADMIN'
    THEN PERFORM public.staff_management_lock_admin_factors(p_organization_id); END IF;
    IF target.role = 'ORG_ADMIN' AND p_role <> 'ORG_ADMIN'
       AND public.staff_management_is_usable_admin(p_organization_id, p_membership_id)
       AND NOT public.staff_management_has_other_usable_admin(p_organization_id, p_membership_id)
    THEN RETURN QUERY SELECT target.version, FALSE, 'LAST_USABLE_ADMIN_REQUIRED'::TEXT; RETURN; END IF;
    IF target.role = 'ORG_ADMIN' AND p_role <> 'ORG_ADMIN'
       AND EXISTS (SELECT 1 FROM public.membership_location_access WHERE membership_id=p_membership_id)
    THEN RETURN QUERY SELECT target.version, FALSE, 'STAFF_ACCESS_INVALID_STATE'::TEXT; RETURN; END IF;
    IF target.status = 'ACTIVE'
       AND target.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       AND p_role NOT IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       AND public.staff_management_has_blockers(p_organization_id, p_membership_id)
    THEN RETURN QUERY SELECT target.version, FALSE, 'STAFF_HANDOVER_REQUIRED'::TEXT; RETURN; END IF;
    UPDATE public.organization_memberships
       SET role=p_role, version=target.version+1, updated_at=clock_timestamp()
     WHERE id=p_membership_id;
    RETURN QUERY SELECT target.version+1, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.staff_management_set_status(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_membership_id UUID,
    p_expected_version INTEGER,
    p_status public.membership_status
) RETURNS TABLE(version INTEGER, changed BOOLEAN, result_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target RECORD;
BEGIN
    PERFORM public.staff_management_authorize_actor(p_actor_membership_id, p_organization_id);
    SELECT membership.role, membership.status, membership.version, membership.user_id
      INTO target FROM public.organization_memberships AS membership
      WHERE membership.id=p_membership_id AND membership.organization_id=p_organization_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED'; END IF;
    IF target.status = p_status THEN RETURN QUERY SELECT target.version, FALSE, 'OK'::TEXT; RETURN; END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version
    THEN RETURN QUERY SELECT target.version, FALSE, 'VERSION_CONFLICT'::TEXT; RETURN; END IF;
    IF p_status = 'INACTIVE' AND public.staff_management_has_blockers(p_organization_id, p_membership_id)
    THEN RETURN QUERY SELECT target.version, FALSE, 'STAFF_HANDOVER_REQUIRED'::TEXT; RETURN; END IF;
    IF p_status = 'INACTIVE' THEN
      PERFORM public.staff_management_lock_admin_factors(p_organization_id);
    END IF;
    IF p_status = 'INACTIVE'
       AND public.staff_management_is_usable_admin(p_organization_id, p_membership_id)
       AND NOT public.staff_management_has_other_usable_admin(p_organization_id, p_membership_id)
    THEN RETURN QUERY SELECT target.version, FALSE, 'LAST_USABLE_ADMIN_REQUIRED'::TEXT; RETURN; END IF;
    UPDATE public.organization_memberships
       SET status=p_status, version=target.version+1, updated_at=clock_timestamp()
     WHERE id=p_membership_id;
    RETURN QUERY SELECT target.version+1, TRUE, 'OK'::TEXT;
END;
$$;

CREATE FUNCTION public.staff_management_set_location_access(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_membership_id UUID,
    p_expected_version INTEGER,
    p_location_ids UUID[],
    p_granted BOOLEAN
) RETURNS TABLE(version INTEGER, changed BOOLEAN, result_code TEXT, affected_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target RECORD; affected INTEGER; requested INTEGER;
BEGIN
    PERFORM public.staff_management_authorize_actor(p_actor_membership_id, p_organization_id);
    IF p_granted IS NULL
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='REQUEST_INVALID'; END IF;
    requested := COALESCE(array_length(p_location_ids, 1), 0);
    IF requested < 1 OR requested > 50 OR requested <> (
      SELECT count(DISTINCT requested_id.id)
      FROM unnest(p_location_ids) AS requested_id(id)
    )
    THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='REQUEST_INVALID'; END IF;
    IF requested <> (SELECT count(*) FROM public.locations WHERE organization_id=p_organization_id AND id=ANY(p_location_ids))
    THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED'; END IF;
    SELECT membership.role, membership.status, membership.version, membership.user_id
      INTO target FROM public.organization_memberships AS membership
      WHERE membership.id=p_membership_id AND membership.organization_id=p_organization_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED'; END IF;
    IF p_granted THEN
      SELECT count(*) INTO affected FROM unnest(p_location_ids) AS requested_id(id)
       WHERE NOT EXISTS (SELECT 1 FROM public.membership_location_access AS access
                         WHERE access.membership_id=p_membership_id AND access.location_id=requested_id.id);
    ELSE
      SELECT count(*) INTO affected FROM public.membership_location_access
       WHERE membership_id=p_membership_id AND location_id=ANY(p_location_ids);
    END IF;
    IF affected = 0 THEN RETURN QUERY SELECT target.version, FALSE, 'OK'::TEXT, 0; RETURN; END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version
    THEN RETURN QUERY SELECT target.version, FALSE, 'VERSION_CONFLICT'::TEXT, affected; RETURN; END IF;
    IF NOT p_granted AND target.status='ACTIVE' AND target.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
       AND public.staff_management_has_blockers(p_organization_id, p_membership_id, p_location_ids)
    THEN RETURN QUERY SELECT target.version, FALSE, 'STAFF_HANDOVER_REQUIRED'::TEXT, affected; RETURN; END IF;
    IF p_granted THEN
      INSERT INTO public.membership_location_access(organization_id,membership_id,location_id)
      SELECT p_organization_id,p_membership_id,requested_id.id
      FROM unnest(p_location_ids) AS requested_id(id)
      ON CONFLICT (membership_id,location_id) DO NOTHING;
    ELSE
      DELETE FROM public.membership_location_access
       WHERE membership_id=p_membership_id AND location_id=ANY(p_location_ids);
    END IF;
    UPDATE public.organization_memberships
       SET version=target.version+1, updated_at=clock_timestamp() WHERE id=p_membership_id;
    RETURN QUERY SELECT target.version+1, TRUE, 'OK'::TEXT, affected;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_management_authorize_actor(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_has_blockers(UUID,UUID,UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_is_usable_admin(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_has_other_usable_admin(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_lock_admin_factors(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_set_role(UUID,UUID,UUID,INTEGER,public.membership_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_set_status(UUID,UUID,UUID,INTEGER,public.membership_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_set_location_access(UUID,UUID,UUID,INTEGER,UUID[],BOOLEAN) FROM PUBLIC;

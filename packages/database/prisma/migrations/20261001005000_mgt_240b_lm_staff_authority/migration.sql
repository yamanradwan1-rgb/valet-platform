-- Issue #240 / T05-B: narrowly extend existing staff-management commands to
-- Location Managers under complete persisted Location-grant coverage.

CREATE FUNCTION public.staff_management_authorize_staff_actor(
    p_actor_membership_id UUID,
    p_organization_id UUID
) RETURNS public.membership_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_role public.membership_role;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('staff-management-org:' || p_organization_id::text, 0)
    );

    SELECT membership.role
      INTO v_role
      FROM public.organization_memberships AS membership
      INNER JOIN public.users AS actor
        ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
      INNER JOIN public.organizations AS organization
        ON organization.id = membership.organization_id
       AND organization.status = 'ACTIVE'
      WHERE membership.id = p_actor_membership_id
        AND membership.organization_id = p_organization_id
        AND membership.status = 'ACTIVE'
        AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
      FOR UPDATE OF membership;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;

    IF v_role = 'ORG_ADMIN' THEN
      -- Keep the original Company Admin authorization contract authoritative.
      PERFORM public.staff_management_authorize_actor(
        p_actor_membership_id,
        p_organization_id
      );
    END IF;
    RETURN v_role;
END;
$$;

CREATE FUNCTION public.staff_management_lock_lm_active_grants(
    p_actor_membership_id UUID,
    p_organization_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Do not acquire location-lifecycle advisory locks here. Location lifecycle
    -- already orders lifecycle-advisory -> staff-org. Row SHARE locks preserve
    -- active-Location proof without reversing that global order.
    PERFORM location.id
      FROM public.membership_location_access AS access
      INNER JOIN public.locations AS location
        ON location.id = access.location_id
       AND location.organization_id = access.organization_id
       AND location.status = 'ACTIVE'
      WHERE access.organization_id = p_organization_id
        AND access.membership_id = p_actor_membership_id
      ORDER BY location.id
      FOR SHARE OF access, location;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
    END IF;
END;
$$;

CREATE FUNCTION public.staff_management_lm_target_covered(
    p_actor_membership_id UUID,
    p_organization_id UUID,
    p_membership_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_memberships AS target
      WHERE target.id = p_membership_id
        AND target.organization_id = p_organization_id
        AND target.id <> p_actor_membership_id
        AND target.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
        AND EXISTS (
          SELECT 1
          FROM public.membership_location_access AS target_access
          WHERE target_access.organization_id = p_organization_id
            AND target_access.membership_id = target.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.membership_location_access AS target_access
          WHERE target_access.organization_id = p_organization_id
            AND target_access.membership_id = target.id
            AND NOT EXISTS (
              SELECT 1
              FROM public.membership_location_access AS actor_access
              INNER JOIN public.locations AS location
                ON location.id = actor_access.location_id
               AND location.organization_id = actor_access.organization_id
               AND location.status = 'ACTIVE'
              WHERE actor_access.organization_id = p_organization_id
                AND actor_access.membership_id = p_actor_membership_id
                AND actor_access.location_id = target_access.location_id
            )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.staff_management_set_role(
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
    actor_role public.membership_role;
BEGIN
    actor_role := public.staff_management_authorize_staff_actor(
      p_actor_membership_id, p_organization_id);
    IF actor_role = 'LOCATION_MANAGER' THEN
      PERFORM public.staff_management_lock_lm_active_grants(
        p_actor_membership_id, p_organization_id);
    END IF;

    SELECT membership.role, membership.status, membership.version,
           membership.user_id, staff_user.status AS user_status
      INTO target
      FROM public.organization_memberships AS membership
      INNER JOIN public.users AS staff_user ON staff_user.id = membership.user_id
      WHERE membership.id = p_membership_id
        AND membership.organization_id = p_organization_id
      FOR UPDATE OF membership;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;

    IF actor_role = 'LOCATION_MANAGER' AND (
      p_role NOT IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
      OR NOT public.staff_management_lm_target_covered(
        p_actor_membership_id, p_organization_id, p_membership_id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;

    IF target.role = p_role THEN
      RETURN QUERY SELECT target.version, FALSE, 'OK'::TEXT; RETURN;
    END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version THEN
      RETURN QUERY SELECT target.version, FALSE, 'VERSION_CONFLICT'::TEXT; RETURN;
    END IF;
    IF target.role = 'ORG_ADMIN' AND p_role <> 'ORG_ADMIN' THEN
      PERFORM public.staff_management_lock_admin_factors(p_organization_id);
    END IF;
    IF target.role = 'ORG_ADMIN' AND p_role <> 'ORG_ADMIN'
       AND public.staff_management_is_usable_admin(p_organization_id, p_membership_id)
       AND NOT public.staff_management_has_other_usable_admin(p_organization_id, p_membership_id)
    THEN
      RETURN QUERY SELECT target.version, FALSE, 'LAST_USABLE_ADMIN_REQUIRED'::TEXT; RETURN;
    END IF;
    IF target.role = 'ORG_ADMIN' AND p_role <> 'ORG_ADMIN'
       AND EXISTS (SELECT 1 FROM public.membership_location_access WHERE membership_id=p_membership_id)
    THEN
      RETURN QUERY SELECT target.version, FALSE, 'STAFF_ACCESS_INVALID_STATE'::TEXT; RETURN;
    END IF;
    IF target.status = 'ACTIVE'
       AND target.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       AND p_role NOT IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
       AND public.staff_management_has_blockers(p_organization_id, p_membership_id)
    THEN
      RETURN QUERY SELECT target.version, FALSE, 'STAFF_HANDOVER_REQUIRED'::TEXT; RETURN;
    END IF;
    UPDATE public.organization_memberships
       SET role=p_role, version=target.version+1, updated_at=clock_timestamp()
     WHERE id=p_membership_id;
    RETURN QUERY SELECT target.version+1, TRUE, 'OK'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_management_set_status(
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
DECLARE
    target RECORD;
    actor_role public.membership_role;
BEGIN
    actor_role := public.staff_management_authorize_staff_actor(
      p_actor_membership_id, p_organization_id);
    IF actor_role = 'LOCATION_MANAGER' THEN
      PERFORM public.staff_management_lock_lm_active_grants(
        p_actor_membership_id, p_organization_id);
    END IF;

    SELECT membership.role, membership.status, membership.version, membership.user_id
      INTO target
      FROM public.organization_memberships AS membership
      WHERE membership.id=p_membership_id
        AND membership.organization_id=p_organization_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;
    IF actor_role = 'LOCATION_MANAGER'
       AND NOT public.staff_management_lm_target_covered(
         p_actor_membership_id, p_organization_id, p_membership_id)
    THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;

    IF target.status = p_status THEN
      RETURN QUERY SELECT target.version, FALSE, 'OK'::TEXT; RETURN;
    END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version THEN
      RETURN QUERY SELECT target.version, FALSE, 'VERSION_CONFLICT'::TEXT; RETURN;
    END IF;
    IF p_status = 'INACTIVE'
       AND public.staff_management_has_blockers(p_organization_id, p_membership_id)
    THEN
      RETURN QUERY SELECT target.version, FALSE, 'STAFF_HANDOVER_REQUIRED'::TEXT; RETURN;
    END IF;
    IF p_status = 'INACTIVE' THEN
      PERFORM public.staff_management_lock_admin_factors(p_organization_id);
    END IF;
    IF p_status = 'INACTIVE'
       AND public.staff_management_is_usable_admin(p_organization_id, p_membership_id)
       AND NOT public.staff_management_has_other_usable_admin(p_organization_id, p_membership_id)
    THEN
      RETURN QUERY SELECT target.version, FALSE, 'LAST_USABLE_ADMIN_REQUIRED'::TEXT; RETURN;
    END IF;
    UPDATE public.organization_memberships
       SET status=p_status, version=target.version+1, updated_at=clock_timestamp()
     WHERE id=p_membership_id;
    RETURN QUERY SELECT target.version+1, TRUE, 'OK'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_management_set_location_access(
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
DECLARE
    target RECORD;
    affected INTEGER;
    requested INTEGER;
    actor_role public.membership_role;
    remaining INTEGER;
BEGIN
    actor_role := public.staff_management_authorize_staff_actor(
      p_actor_membership_id, p_organization_id);
    IF actor_role = 'LOCATION_MANAGER' THEN
      PERFORM public.staff_management_lock_lm_active_grants(
        p_actor_membership_id, p_organization_id);
    END IF;

    IF p_granted IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='REQUEST_INVALID';
    END IF;
    requested := COALESCE(array_length(p_location_ids, 1), 0);
    IF requested < 1 OR requested > 50 OR requested <> (
      SELECT count(DISTINCT requested_id.id)
      FROM unnest(p_location_ids) AS requested_id(id)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='REQUEST_INVALID';
    END IF;
    IF requested <> (
      SELECT count(*) FROM public.locations
      WHERE organization_id=p_organization_id AND id=ANY(p_location_ids)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;
    IF actor_role = 'LOCATION_MANAGER' AND requested <> (
      SELECT count(*)
      FROM public.membership_location_access AS actor_access
      INNER JOIN public.locations AS location
        ON location.id = actor_access.location_id
       AND location.organization_id = actor_access.organization_id
       AND location.status = 'ACTIVE'
      WHERE actor_access.organization_id = p_organization_id
        AND actor_access.membership_id = p_actor_membership_id
        AND actor_access.location_id=ANY(p_location_ids)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;

    SELECT membership.role, membership.status, membership.version, membership.user_id
      INTO target
      FROM public.organization_memberships AS membership
      WHERE membership.id=p_membership_id
        AND membership.organization_id=p_organization_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;
    IF actor_role = 'LOCATION_MANAGER'
       AND NOT public.staff_management_lm_target_covered(
         p_actor_membership_id, p_organization_id, p_membership_id)
    THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;

    IF p_granted THEN
      SELECT count(*) INTO affected
      FROM unnest(p_location_ids) AS requested_id(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.membership_location_access AS access
        WHERE access.membership_id=p_membership_id
          AND access.location_id=requested_id.id
      );
    ELSE
      SELECT count(*) INTO affected
      FROM public.membership_location_access
      WHERE membership_id=p_membership_id AND location_id=ANY(p_location_ids);
    END IF;
    IF affected = 0 THEN
      RETURN QUERY SELECT target.version, FALSE, 'OK'::TEXT, 0; RETURN;
    END IF;
    IF actor_role = 'LOCATION_MANAGER' AND NOT p_granted THEN
      SELECT count(*) INTO remaining
      FROM public.membership_location_access
      WHERE membership_id=p_membership_id
        AND organization_id=p_organization_id
        AND NOT (location_id=ANY(p_location_ids));
      IF remaining < 1 THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
      END IF;
    END IF;
    IF p_expected_version IS NULL OR target.version <> p_expected_version THEN
      RETURN QUERY SELECT target.version, FALSE, 'VERSION_CONFLICT'::TEXT, affected; RETURN;
    END IF;
    IF NOT p_granted AND target.status='ACTIVE'
       AND target.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR')
       AND public.staff_management_has_blockers(
         p_organization_id, p_membership_id, p_location_ids)
    THEN
      RETURN QUERY SELECT target.version, FALSE, 'STAFF_HANDOVER_REQUIRED'::TEXT, affected; RETURN;
    END IF;
    IF p_granted THEN
      INSERT INTO public.membership_location_access(
        organization_id,membership_id,location_id)
      SELECT p_organization_id,p_membership_id,requested_id.id
      FROM unnest(p_location_ids) AS requested_id(id)
      ON CONFLICT (membership_id,location_id) DO NOTHING;
    ELSE
      DELETE FROM public.membership_location_access
       WHERE membership_id=p_membership_id AND location_id=ANY(p_location_ids);
    END IF;
    IF actor_role = 'LOCATION_MANAGER'
       AND NOT public.staff_management_lm_target_covered(
         p_actor_membership_id, p_organization_id, p_membership_id)
    THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;
    UPDATE public.organization_memberships
       SET version=target.version+1, updated_at=clock_timestamp()
     WHERE id=p_membership_id;
    RETURN QUERY SELECT target.version+1, TRUE, 'OK'::TEXT, affected;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_management_authorize_staff_actor(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_lock_lm_active_grants(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_lm_target_covered(UUID,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_set_role(UUID,UUID,UUID,INTEGER,public.membership_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_set_status(UUID,UUID,UUID,INTEGER,public.membership_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_set_location_access(UUID,UUID,UUID,INTEGER,UUID[],BOOLEAN) FROM PUBLIC;

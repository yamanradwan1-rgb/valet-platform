-- Option C S03 forward-only repair: preserve original migration checksum and history.
-- DROP RESTRICT is intentional: CREATE OR REPLACE cannot rename INPUT parameters
-- (SQLSTATE 42P13); any unexpected dependent object aborts this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

DROP FUNCTION public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text) RESTRICT;
DROP FUNCTION public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text) RESTRICT;
DROP FUNCTION public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean) RESTRICT;
DROP FUNCTION public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_status) RESTRICT;
DROP FUNCTION public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_role) RESTRICT;
DROP FUNCTION public.staff_management_touch_writer_activity(uuid,uuid,text) RESTRICT;
DROP FUNCTION public.staff_management_authorize_writer(uuid,uuid,text,uuid,uuid) RESTRICT;

-- The seven raw-bearer definitions and their explicit PUBLIC revocations follow.

-- Option C S03: require a current bearer-bound MFA session for management writes.
-- Existing CAS/last-admin/LM helpers remain private and retain their own checks.
CREATE FUNCTION public.staff_management_authorize_writer(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  -- Lock the actual session while checking it, fencing concurrent refresh,
  -- logout, factor change, user disable and management activity changes.
  PERFORM 1 FROM public.staff_auth_sessions AS session
  INNER JOIN public.users AS actor ON actor.id = session.user_id
  INNER JOIN public.user_mfa_totp_factors AS factor
    ON factor.id = session.mfa_factor_id AND factor.user_id = session.user_id
   AND factor.state = 'ACTIVE'
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.current_access_token_hash = 'staff-access-sha256:v1:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')), 'hex')
    AND session.revoked_at IS NULL
    AND actor.status = 'ACTIVE'
    AND v_now < session.access_expires_at
    AND v_now < session.absolute_expires_at
    AND session.mfa_authenticated_at IS NOT NULL
    AND session.last_admin_activity_at IS NOT NULL
    AND session.mfa_authenticated_at <= v_now
    AND session.last_admin_activity_at <= v_now
    AND v_now <= session.mfa_authenticated_at + INTERVAL '5 minutes'
    AND v_now < session.last_admin_activity_at + INTERVAL '30 minutes'
  FOR UPDATE OF session, actor FOR SHARE OF factor;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;

  PERFORM 1 FROM public.organization_memberships AS membership
  INNER JOIN public.organizations AS organization
    ON organization.id = membership.organization_id
   AND organization.status = 'ACTIVE'
  INNER JOIN public.organization_subscriptions AS subscription
    ON subscription.organization_id = organization.id
   AND subscription.dashboard_access_enabled = TRUE
  WHERE membership.id = p_actor_membership_id
    AND membership.organization_id = p_organization_id
    AND membership.user_id = p_user_id
    AND membership.status = 'ACTIVE'
    AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
  FOR UPDATE OF membership;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
END;
$$;

CREATE FUNCTION public.staff_management_touch_writer_activity(
  p_session_id uuid, p_user_id uuid, p_access_token text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.staff_auth_sessions
  SET last_admin_activity_at = clock_timestamp()
  WHERE id = p_session_id AND user_id = p_user_id
    AND current_access_token_hash = 'staff-access-sha256:v1:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')), 'hex')
    AND revoked_at IS NULL
    AND clock_timestamp() < access_expires_at
    AND clock_timestamp() < absolute_expires_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;
END;
$$;

CREATE FUNCTION public.staff_management_authorized_set_role(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid,
  p_membership_id uuid, p_expected_version integer, p_role public.membership_role
) RETURNS TABLE(version integer, changed boolean, result_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.staff_management_authorize_writer(
    p_session_id, p_user_id, p_access_token, p_actor_membership_id, p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_management_set_role(
    p_actor_membership_id, p_organization_id, p_membership_id, p_expected_version, p_role);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id, p_user_id, p_access_token);
END;
$$;

CREATE FUNCTION public.staff_management_authorized_set_status(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid,
  p_membership_id uuid, p_expected_version integer, p_status public.membership_status
) RETURNS TABLE(version integer, changed boolean, result_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.staff_management_authorize_writer(
    p_session_id, p_user_id, p_access_token, p_actor_membership_id, p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_management_set_status(
    p_actor_membership_id, p_organization_id, p_membership_id, p_expected_version, p_status);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id, p_user_id, p_access_token);
END;
$$;

CREATE FUNCTION public.staff_management_authorized_set_location_access(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid,
  p_membership_id uuid, p_expected_version integer, p_location_ids uuid[], p_granted boolean
) RETURNS TABLE(version integer, changed boolean, result_code text, affected_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.staff_management_authorize_writer(
    p_session_id, p_user_id, p_access_token, p_actor_membership_id, p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_management_set_location_access(
    p_actor_membership_id, p_organization_id, p_membership_id,
    p_expected_version, p_location_ids, p_granted);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id, p_user_id, p_access_token);
END;
$$;

CREATE FUNCTION public.staff_management_authorized_onboarding_create(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid, p_operation_id uuid,
  p_fingerprint text, p_email text, p_first_name text, p_last_name text,
  p_role public.membership_role, p_location_ids uuid[], p_token_hash text
) RETURNS TABLE(membership_id uuid, invitation_id uuid, generation integer,
                expires_at timestamptz, changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.staff_management_authorize_writer(
    p_session_id, p_user_id, p_access_token, p_actor_membership_id, p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_onboarding_create(
    p_actor_membership_id, p_organization_id, p_operation_id, p_fingerprint,
    p_email, p_first_name, p_last_name, p_role, p_location_ids, p_token_hash);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id, p_user_id, p_access_token);
END;
$$;

CREATE FUNCTION public.staff_management_authorized_onboarding_resend(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid, p_membership_id uuid,
  p_operation_id uuid, p_fingerprint text, p_token_hash text
) RETURNS TABLE(membership_id uuid, invitation_id uuid, generation integer,
                expires_at timestamptz, changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.staff_management_authorize_writer(
    p_session_id, p_user_id, p_access_token, p_actor_membership_id, p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_onboarding_resend(
    p_actor_membership_id, p_organization_id, p_membership_id,
    p_operation_id, p_fingerprint, p_token_hash);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id, p_user_id, p_access_token);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_management_authorize_writer(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_touch_writer_activity(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,public.membership_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;

-- Recreating functions discards previous ACLs. Normalize both new wrappers and
-- old actor-UUID entrypoints to an exact allowlist, including any historical
-- direct grants (and default EXECUTE grants) still present on upgraded DBs.
-- Keep the S01 Staff Auth writer as the sole non-owner activation principal.
DO $s03_acl$
DECLARE
  v_signature text;
  v_grantee record;
BEGIN
  FOR v_signature IN SELECT unnest(ARRAY[
    'public.staff_management_authorize_writer(uuid,uuid,text,uuid,uuid)',
    'public.staff_management_touch_writer_activity(uuid,uuid,text)',
    'public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,membership_role)',
    'public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,membership_status)',
    'public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)',
    'public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)',
    'public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)',
    'public.staff_management_set_role(uuid,uuid,uuid,integer,membership_role)',
    'public.staff_management_set_status(uuid,uuid,uuid,integer,membership_status)',
    'public.staff_management_set_location_access(uuid,uuid,uuid,integer,uuid[],boolean)',
    'public.staff_onboarding_create(uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)',
    'public.staff_onboarding_resend(uuid,uuid,uuid,uuid,text,text)',
    'public.staff_onboarding_activate(text,text,text)'
  ]) LOOP
    IF pg_catalog.to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'S03 required SQL function missing: %', v_signature;
    END IF;
    FOR v_grantee IN
      SELECT DISTINCT access.grantee AS grantee_oid, role.rolname
      FROM pg_catalog.pg_proc AS function
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(function.proacl,
          pg_catalog.acldefault('f', function.proowner))) AS access
      LEFT JOIN pg_catalog.pg_roles AS role ON role.oid = access.grantee
      WHERE function.oid = pg_catalog.to_regprocedure(v_signature)
        AND access.privilege_type = 'EXECUTE'
        AND access.grantee <> function.proowner
    LOOP
      IF v_grantee.grantee_oid = 0 THEN
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
      ELSIF v_grantee.rolname IS NOT NULL THEN
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON FUNCTION %s FROM %I', v_signature,
          v_grantee.rolname);
      ELSE
        RAISE EXCEPTION 'S03 SQL function has an unresolvable ACL grantee';
      END IF;
    END LOOP;
  END LOOP;

  -- Migrations run before role provisioning on fresh installs. Re-grant only
  -- when a known writer exists; provisioners grant the same narrow closure.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'vaylet_management_writer') THEN
    FOREACH v_signature IN ARRAY ARRAY[
      'public.staff_management_authorized_set_role(uuid,uuid,text,uuid,uuid,uuid,integer,membership_role)',
      'public.staff_management_authorized_set_status(uuid,uuid,text,uuid,uuid,uuid,integer,membership_status)',
      'public.staff_management_authorized_set_location_access(uuid,uuid,text,uuid,uuid,uuid,integer,uuid[],boolean)',
      'public.staff_management_authorized_onboarding_create(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,membership_role,uuid[],text)',
      'public.staff_management_authorized_onboarding_resend(uuid,uuid,text,uuid,uuid,uuid,uuid,text,text)'
    ] LOOP
      EXECUTE pg_catalog.format(
        'GRANT EXECUTE ON FUNCTION %s TO %I', v_signature,
        'vaylet_management_writer');
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'vaylet_staff_auth_writer') THEN
    GRANT EXECUTE ON FUNCTION public.staff_onboarding_activate(text,text,text)
      TO vaylet_staff_auth_writer;
  END IF;
END;
$s03_acl$;

COMMIT;

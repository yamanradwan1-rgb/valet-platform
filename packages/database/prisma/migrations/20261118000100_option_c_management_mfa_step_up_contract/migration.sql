-- Preserve the existing Option C lock order and bearer/tenant checks while
-- restoring the accepted Management API contract: a valid authorized actor
-- with missing or stale MFA receives a soft MFA_STEP_UP_REQUIRED response.
-- Invalid bearer/session/user/tenant authority remains concealed.
CREATE OR REPLACE FUNCTION public.staff_management_authorize_writer(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_now timestamptz;
  v_mfa_authenticated_at timestamptz;
  v_last_admin_activity_at timestamptz;
  v_mfa_factor_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('staff-user-security:' || p_user_id::text, 0)
  );

  PERFORM actor.id FROM public.users AS actor
  WHERE actor.id = p_user_id AND actor.status = 'ACTIVE'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  SELECT session.mfa_authenticated_at,session.last_admin_activity_at,
         session.mfa_factor_id
    INTO v_mfa_authenticated_at,v_last_admin_activity_at,v_mfa_factor_id
  FROM public.staff_auth_sessions AS session
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.current_access_token_hash = 'staff-access-sha256:v1:' ||
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')), 'hex'
      )
    AND session.revoked_at IS NULL
    AND v_now < session.access_expires_at
    AND v_now < session.absolute_expires_at
  FOR UPDATE OF session;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHORIZATION_DENIED';
  END IF;

  -- Serialize same-organization Management writers before locking the actor
  -- membership. This keeps the established User -> Session -> Organization ->
  -- Membership order and prevents reciprocal actor/target mutations from
  -- taking membership row locks in opposite order (PostgreSQL 40P01).
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'staff-management-org:' || p_organization_id::text, 0
    )
  );

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

  PERFORM 1 FROM public.user_mfa_totp_factors AS factor
  WHERE factor.id = v_mfa_factor_id
    AND factor.user_id = p_user_id
    AND factor.state = 'ACTIVE'
  FOR SHARE OF factor;
  IF NOT FOUND
     OR v_mfa_authenticated_at IS NULL
     OR v_last_admin_activity_at IS NULL
     OR v_mfa_authenticated_at > v_now
     OR v_last_admin_activity_at > v_now
     OR v_now > v_mfa_authenticated_at + INTERVAL '5 minutes'
     OR v_now >= v_last_admin_activity_at + INTERVAL '30 minutes' THEN
    RAISE EXCEPTION USING MESSAGE = 'MFA_STEP_UP_REQUIRED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_management_authorize_writer(
  uuid,uuid,text,uuid,uuid
) FROM PUBLIC;

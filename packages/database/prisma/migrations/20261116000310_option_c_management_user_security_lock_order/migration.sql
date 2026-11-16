-- Preserve the deployed authorization ABI while joining the canonical Staff
-- user-security serialization order used by auth, onboarding and Runtime.
CREATE OR REPLACE FUNCTION public.staff_management_authorize_writer(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_now timestamptz;
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
  PERFORM 1 FROM public.staff_auth_sessions AS session
  INNER JOIN public.user_mfa_totp_factors AS factor
    ON factor.id = session.mfa_factor_id AND factor.user_id = session.user_id
   AND factor.state = 'ACTIVE'
  WHERE session.id = p_session_id
    AND session.user_id = p_user_id
    AND session.current_access_token_hash = 'staff-access-sha256:v1:' ||
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_access_token, 'UTF8')), 'hex'
      )
    AND session.revoked_at IS NULL
    AND v_now < session.access_expires_at
    AND v_now < session.absolute_expires_at
    AND session.mfa_authenticated_at IS NOT NULL
    AND session.last_admin_activity_at IS NOT NULL
    AND session.mfa_authenticated_at <= v_now
    AND session.last_admin_activity_at <= v_now
    AND v_now <= session.mfa_authenticated_at + INTERVAL '5 minutes'
    AND v_now < session.last_admin_activity_at + INTERVAL '30 minutes'
  FOR UPDATE OF session FOR SHARE OF factor;
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

REVOKE ALL ON FUNCTION public.staff_management_authorize_writer(
  uuid,uuid,text,uuid,uuid
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.staff_management_authorized_onboarding_create(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid, p_operation_id uuid,
  p_fingerprint text, p_email text, p_first_name text, p_last_name text,
  p_role public.membership_role, p_location_ids uuid[], p_token_hash text
) RETURNS TABLE(membership_id uuid, invitation_id uuid, generation integer,
                expires_at timestamptz, changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_actor_user uuid;
BEGIN
  SELECT session.user_id INTO v_actor_user
  FROM public.staff_auth_sessions AS session
  WHERE session.id=p_session_id AND session.user_id=p_user_id
    AND session.current_access_token_hash='staff-access-sha256:v1:' ||
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_access_token,'UTF8')),'hex'
      );
  IF p_email IS NOT NULL THEN
    PERFORM public.staff_onboarding_lock_identity(v_actor_user,p_email);
  END IF;
  PERFORM public.staff_management_authorize_writer(
    p_session_id,p_user_id,p_access_token,p_actor_membership_id,p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_onboarding_create(
    p_actor_membership_id,p_organization_id,p_operation_id,p_fingerprint,
    p_email,p_first_name,p_last_name,p_role,p_location_ids,p_token_hash);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id,p_user_id,p_access_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_management_authorized_onboarding_resend(
  p_session_id uuid, p_user_id uuid, p_access_token text,
  p_actor_membership_id uuid, p_organization_id uuid, p_membership_id uuid,
  p_operation_id uuid, p_fingerprint text, p_token_hash text
) RETURNS TABLE(membership_id uuid, invitation_id uuid, generation integer,
                expires_at timestamptz, changed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_actor_user uuid; v_email text;
BEGIN
  SELECT session.user_id INTO v_actor_user
  FROM public.staff_auth_sessions AS session
  WHERE session.id=p_session_id AND session.user_id=p_user_id
    AND session.current_access_token_hash='staff-access-sha256:v1:' ||
      pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(p_access_token,'UTF8')),'hex'
      );
  SELECT account.email INTO v_email
  FROM public.organization_memberships AS membership
  INNER JOIN public.users AS account ON account.id=membership.user_id
  WHERE membership.id=p_membership_id
    AND membership.organization_id=p_organization_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  PERFORM public.staff_onboarding_lock_identity(v_actor_user,v_email);
  PERFORM public.staff_management_authorize_writer(
    p_session_id,p_user_id,p_access_token,p_actor_membership_id,p_organization_id);
  RETURN QUERY SELECT * FROM public.staff_onboarding_resend(
    p_actor_membership_id,p_organization_id,p_membership_id,
    p_operation_id,p_fingerprint,p_token_hash);
  PERFORM public.staff_management_touch_writer_activity(
    p_session_id,p_user_id,p_access_token);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_management_authorized_onboarding_create(
  uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,public.membership_role,uuid[],text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_management_authorized_onboarding_resend(
  uuid,uuid,text,uuid,uuid,uuid,uuid,text,text
) FROM PUBLIC;

-- T05-D: public proof is verified by Staff auth; the guarded command rechecks it.
ALTER TABLE public.anti_abuse_events DROP CONSTRAINT anti_abuse_events_scope_check;
ALTER TABLE public.anti_abuse_events ADD CONSTRAINT anti_abuse_events_scope_check CHECK (
  scope IN (
    'v1:staff-login-identifier', 'v1:staff-client-address',
    'v1:guest-client-address', 'v1:guest-token',
    'v1:handoff-issuance-session', 'v1:handoff-verification-session',
    'v1:mfa-totp-user', 'v1:mfa-recovery-user',
    'v1:staff-onboarding-create-organization', 'v1:staff-onboarding-resend-membership',
    'v1:staff-activation-credential', 'v1:staff-activation-client-address'
  )
);

CREATE FUNCTION public.staff_onboarding_activate(
  p_token_hash TEXT, p_verified_password_hash TEXT, p_new_password_hash TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_identity RECORD;
  v_invitation public.staff_onboarding_invitations%ROWTYPE;
  v_member public.organization_memberships%ROWTYPE;
  v_account public.users%ROWTYPE;
  v_now TIMESTAMPTZ(3);
BEGIN
  SELECT account.id AS user_id, account.email, invitation.organization_id,
         invitation.membership_id, invitation.id AS invitation_id
  INTO v_identity
  FROM public.staff_onboarding_invitations AS invitation
  JOIN public.organization_memberships AS member
    ON member.id=invitation.membership_id AND member.organization_id=invitation.organization_id
  JOIN public.users AS account ON account.id=member.user_id
  WHERE invitation.token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED'; END IF;

  -- Same account-first ordering as create/resend and the global security path.
  PERFORM public.staff_onboarding_lock_identity(NULL,v_identity.email);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('staff-management-org:' || v_identity.organization_id::text,0));
  PERFORM 1 FROM public.organizations
    WHERE id=v_identity.organization_id AND status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED'; END IF;
  SELECT * INTO v_member FROM public.organization_memberships
    WHERE id=v_identity.membership_id AND organization_id=v_identity.organization_id FOR UPDATE;
  IF NOT FOUND OR v_member.user_id <> v_identity.user_id THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
  END IF;
  SELECT * INTO v_account FROM public.users WHERE id=v_member.user_id FOR UPDATE;
  IF NOT FOUND OR v_account.email <> v_identity.email OR v_account.status::text='DISABLED' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
  END IF;
  SELECT * INTO v_invitation FROM public.staff_onboarding_invitations
    WHERE id=v_identity.invitation_id AND token_hash=p_token_hash
      AND organization_id=v_member.organization_id AND membership_id=v_member.id FOR UPDATE;
  IF NOT FOUND OR v_invitation.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
  END IF;
  IF v_account.status::text='ACTIVE' THEN
    IF p_verified_password_hash IS NULL OR v_account.password_hash IS DISTINCT FROM p_verified_password_hash
      OR p_new_password_hash IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
    END IF;
  ELSIF v_account.status::text='PENDING' THEN
    IF v_account.password_hash IS NOT NULL OR p_verified_password_hash IS NOT NULL
      OR p_new_password_hash IS NULL
      OR p_new_password_hash !~ '^\$argon2id\$v=19\$m=65536,p=4,t=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$' THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
  END IF;

  -- Unknown-response recovery requires both current ownership and durable completion.
  IF v_invitation.consumed_at IS NOT NULL THEN
    IF v_member.status::text='ACTIVE' AND v_account.status::text='ACTIVE' AND EXISTS (
      SELECT 1 FROM public.audit_events WHERE organization_id=v_member.organization_id
        AND entity_type='OrganizationMembership' AND entity_id=v_member.id
        AND event_type='STAFF_ONBOARDING_ACTIVATED'
        AND metadata_json->>'invitationId'=v_invitation.id::text
        AND metadata_json->>'generation'=v_invitation.generation::text
    ) THEN RETURN 'ALREADY_ACTIVATED'; END IF;
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
  END IF;

  v_now := clock_timestamp();
  IF v_member.status::text <> 'PENDING'
    OR v_now >= v_invitation.expires_at
    OR v_invitation.generation <> (
      SELECT max(generation) FROM public.staff_onboarding_invitations WHERE membership_id=v_member.id
    ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ACTIVATION_FAILED';
  END IF;
  -- No protected state change precedes all authoritative invitation/account proof.
  IF v_account.status::text='PENDING' THEN
    UPDATE public.users SET status='ACTIVE',password_hash=p_new_password_hash,updated_at=v_now
      WHERE id=v_account.id;
  END IF;
  UPDATE public.organization_memberships SET status='ACTIVE',version=version+1,updated_at=v_now
    WHERE id=v_member.id AND organization_id=v_member.organization_id;
  UPDATE public.staff_onboarding_invitations SET consumed_at=v_now WHERE id=v_invitation.id;
  INSERT INTO public.audit_events(
    id,organization_id,location_id,actor_membership_id,actor_type,event_type,
    entity_type,entity_id,metadata_json,idempotency_key,occurred_at
  ) VALUES(gen_random_uuid(),v_member.organization_id,NULL,v_member.id,'MEMBERSHIP',
    'STAFF_ONBOARDING_ACTIVATED','OrganizationMembership',v_member.id,
    jsonb_build_object('invitationId',v_invitation.id,'generation',v_invitation.generation,'outcome','ACTIVATED'),
    v_invitation.id::text,v_now);
  RETURN 'ACTIVATED';
END;
$$;
REVOKE ALL ON FUNCTION public.staff_onboarding_activate(TEXT,TEXT,TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.staff_onboarding_guard_audit() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.event_type IN ('STAFF_ONBOARDING_INVITATION_ISSUED','STAFF_ONBOARDING_INVITATION_RESENT','STAFF_ONBOARDING_ACTIVATED')
    AND current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.audit_events'::regclass) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;

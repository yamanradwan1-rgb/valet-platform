-- T05-C: additive issuance foundation only. No activation/consume entrypoint.
ALTER TYPE public.user_status ADD VALUE 'PENDING';
ALTER TYPE public.membership_status ADD VALUE 'PENDING';
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;
-- Compare text so the newly added enum need not be used before migration commit.
ALTER TABLE public.users ADD CONSTRAINT users_pending_password_check CHECK (
  (status::text = 'PENDING' AND password_hash IS NULL)
  OR (status::text <> 'PENDING' AND password_hash IS NOT NULL)
);

CREATE TABLE public.staff_onboarding_invitations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  membership_id UUID NOT NULL,
  issued_by_membership_id UUID NOT NULL,
  generation INTEGER NOT NULL CHECK (generation > 0),
  operation_id UUID NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^staff-invite-sha256:v1:[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ(3) NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  consumed_at TIMESTAMPTZ(3),
  revoked_at TIMESTAMPTZ(3),
  CONSTRAINT staff_onboarding_member_fkey FOREIGN KEY (organization_id,membership_id)
    REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT staff_onboarding_actor_fkey FOREIGN KEY (organization_id,issued_by_membership_id)
    REFERENCES public.organization_memberships(organization_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT staff_onboarding_generation_key UNIQUE(membership_id,generation),
  CONSTRAINT staff_onboarding_operation_key UNIQUE(organization_id,operation_id),
  CONSTRAINT staff_onboarding_token_key UNIQUE(token_hash),
  CONSTRAINT staff_onboarding_expiry_check CHECK (
    expires_at > created_at
    AND (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at <= expires_at))
    AND (revoked_at IS NULL OR revoked_at >= created_at)
    AND (consumed_at IS NULL OR revoked_at IS NULL)
  )
);
CREATE UNIQUE INDEX staff_onboarding_one_current_key
  ON public.staff_onboarding_invitations(membership_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION public.staff_onboarding_proof_current(p_invitation_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_onboarding_invitations AS invitation
    JOIN public.organization_memberships AS membership
      ON membership.id = invitation.membership_id AND membership.organization_id = invitation.organization_id
    JOIN public.users AS account ON account.id = membership.user_id
    WHERE invitation.id = p_invitation_id AND invitation.consumed_at IS NULL
      AND invitation.revoked_at IS NULL AND clock_timestamp() < invitation.expires_at
      AND membership.status::text = 'PENDING' AND account.status::text IN ('PENDING','ACTIVE')
  )
$$;

CREATE FUNCTION public.staff_onboarding_lock_identity(p_actor_id UUID,p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user_id UUID; v_lock_id UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('staff-onboarding-email:' || p_email,0));
  SELECT id INTO v_user_id FROM public.users WHERE email = p_email;
  FOR v_lock_id IN SELECT DISTINCT id FROM unnest(ARRAY[p_actor_id,v_user_id]) AS ids(id)
    WHERE id IS NOT NULL ORDER BY id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('staff-user-security:' || v_lock_id::text,0));
  END LOOP;
  RETURN v_user_id;
END;
$$;

CREATE FUNCTION public.staff_onboarding_authorize_actor(p_actor UUID,p_org UUID)
RETURNS public.membership_role LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_role public.membership_role;
BEGIN
  v_role := public.staff_management_authorize_staff_actor(p_actor,p_org);
  PERFORM 1 FROM public.organizations WHERE id = p_org AND status = 'ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  PERFORM 1 FROM public.organization_subscriptions
    WHERE organization_id = p_org AND dashboard_access_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  IF v_role = 'LOCATION_MANAGER' THEN
    PERFORM public.staff_management_lock_lm_active_grants(p_actor,p_org);
  END IF;
  RETURN v_role;
END;
$$;

CREATE FUNCTION public.staff_onboarding_authorize_target(p_actor UUID,p_org UUID,p_member UUID,p_actor_role public.membership_role)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user UUID;
BEGIN
  SELECT user_id INTO v_user FROM public.organization_memberships
    WHERE id = p_member AND organization_id = p_org AND status::text = 'PENDING'
      AND role IN ('LOCATION_MANAGER','VALET_SUPERVISOR','VALET_EMPLOYEE') FOR UPDATE;
  IF NOT FOUND OR (p_actor_role = 'LOCATION_MANAGER' AND
    NOT public.staff_management_lm_target_covered(p_actor,p_org,p_member)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  PERFORM 1 FROM public.users WHERE id = v_user AND status::text IN ('PENDING','ACTIVE') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ONBOARDING_UNAVAILABLE'; END IF;
  RETURN v_user;
END;
$$;

CREATE FUNCTION public.staff_onboarding_append_invitation(
  p_actor UUID,p_org UUID,p_member UUID,p_operation UUID,p_fingerprint TEXT,p_hash TEXT,p_generation INTEGER,p_event TEXT
) RETURNS public.staff_onboarding_invitations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.staff_onboarding_invitations%ROWTYPE; v_now TIMESTAMPTZ(3); v_role public.membership_role; v_count INTEGER;
BEGIN
  v_now := clock_timestamp();
  INSERT INTO public.staff_onboarding_invitations(
    id,organization_id,membership_id,issued_by_membership_id,generation,operation_id,request_fingerprint,token_hash,created_at,expires_at
  ) VALUES(gen_random_uuid(),p_org,p_member,p_actor,p_generation,p_operation,p_fingerprint,p_hash,v_now,v_now+INTERVAL '24 hours')
  RETURNING * INTO v_row;
  SELECT role INTO v_role FROM public.organization_memberships WHERE id=p_member AND organization_id=p_org;
  SELECT count(*) INTO v_count FROM public.membership_location_access WHERE membership_id=p_member AND organization_id=p_org;
  INSERT INTO public.audit_events(
    id,organization_id,location_id,actor_membership_id,actor_type,event_type,entity_type,entity_id,metadata_json,idempotency_key,occurred_at
  ) VALUES(gen_random_uuid(),p_org,NULL,p_actor,'MEMBERSHIP',p_event,'OrganizationMembership',p_member,
    jsonb_build_object('invitationId',v_row.id,'generation',p_generation,'operationId',p_operation,
      'outcome','INVITE_ISSUED','role',v_role,'locationCount',v_count),p_operation::text,v_now);
  RETURN v_row;
END;
$$;

CREATE FUNCTION public.staff_onboarding_create(
  p_actor UUID,p_org UUID,p_operation UUID,p_fingerprint TEXT,p_email TEXT,p_first TEXT,p_last TEXT,
  p_role public.membership_role,p_locations UUID[],p_hash TEXT
) RETURNS TABLE(membership_id UUID,invitation_id UUID,generation INTEGER,expires_at TIMESTAMPTZ,changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user UUID; v_actor_user UUID; v_member UUID; v_actor_role public.membership_role;
  v_row public.staff_onboarding_invitations%ROWTYPE; v_count INTEGER;
BEGIN
  SELECT user_id INTO v_actor_user FROM public.organization_memberships WHERE id=p_actor AND organization_id=p_org;
  v_user := public.staff_onboarding_lock_identity(v_actor_user,p_email);
  v_actor_role := public.staff_onboarding_authorize_actor(p_actor,p_org);
  IF p_operation IS NULL OR p_fingerprint IS NULL OR p_hash IS NULL OR p_email IS NULL
    OR p_email <> lower(btrim(p_email)) OR char_length(p_email) NOT BETWEEN 3 AND 254
    OR p_first IS NULL OR p_last IS NULL OR p_role IS NULL
    OR p_role NOT IN ('LOCATION_MANAGER','VALET_SUPERVISOR','VALET_EMPLOYEE') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REQUEST_INVALID';
  END IF;
  IF v_actor_role = 'LOCATION_MANAGER' AND p_role NOT IN ('VALET_SUPERVISOR','VALET_EMPLOYEE') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  v_count := COALESCE(cardinality(p_locations),0);
  IF v_count NOT BETWEEN 1 AND 50 OR v_count <> (SELECT count(DISTINCT id) FROM unnest(p_locations) AS ids(id)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REQUEST_INVALID';
  END IF;
  PERFORM id FROM public.locations WHERE organization_id=p_org AND id=ANY(p_locations) ORDER BY id FOR SHARE;
  IF v_count <> (SELECT count(*) FROM public.locations WHERE organization_id=p_org AND id=ANY(p_locations)) OR
    (v_actor_role = 'LOCATION_MANAGER' AND v_count <> (
      SELECT count(*) FROM public.membership_location_access AS access JOIN public.locations AS location
        ON location.id=access.location_id AND location.organization_id=access.organization_id AND location.status='ACTIVE'
      WHERE access.organization_id=p_org AND access.membership_id=p_actor AND access.location_id=ANY(p_locations)
    )) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;

  SELECT * INTO v_row FROM public.staff_onboarding_invitations AS prior
    WHERE prior.organization_id=p_org AND prior.operation_id=p_operation;
  IF FOUND THEN
    PERFORM public.staff_onboarding_authorize_target(p_actor,p_org,v_row.membership_id,v_actor_role);
    IF v_row.request_fingerprint <> p_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_row.membership_id,v_row.id,v_row.generation,v_row.expires_at,FALSE; RETURN;
  END IF;
  IF v_user IS NOT NULL AND EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p_org AND user_id=v_user) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ONBOARDING_UNAVAILABLE';
  END IF;
  IF v_user IS NOT NULL THEN
    PERFORM 1 FROM public.users WHERE id=v_user AND status::text IN ('ACTIVE','PENDING') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ONBOARDING_UNAVAILABLE'; END IF;
  END IF;
  -- No protected write precedes the complete persisted authority/account proof.
  IF v_user IS NULL THEN
    v_user := gen_random_uuid();
    INSERT INTO public.users(id,email,password_hash,status,updated_at) VALUES(v_user,p_email,NULL,'PENDING',clock_timestamp());
  END IF;
  v_member := gen_random_uuid();
  INSERT INTO public.organization_memberships(id,organization_id,user_id,first_name,last_name,role,status,updated_at)
    VALUES(v_member,p_org,v_user,p_first,p_last,p_role,'PENDING',clock_timestamp());
  INSERT INTO public.membership_location_access(organization_id,membership_id,location_id)
    SELECT p_org,v_member,id FROM unnest(p_locations) AS ids(id);
  v_row := public.staff_onboarding_append_invitation(p_actor,p_org,v_member,p_operation,p_fingerprint,p_hash,1,'STAFF_ONBOARDING_INVITATION_ISSUED');
  RETURN QUERY SELECT v_member,v_row.id,v_row.generation,v_row.expires_at,TRUE;
END;
$$;

CREATE FUNCTION public.staff_onboarding_resend(p_actor UUID,p_org UUID,p_member UUID,p_operation UUID,p_fingerprint TEXT,p_hash TEXT)
RETURNS TABLE(membership_id UUID,invitation_id UUID,generation INTEGER,expires_at TIMESTAMPTZ,changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_actor_user UUID; v_email TEXT; v_actor_role public.membership_role;
  v_row public.staff_onboarding_invitations%ROWTYPE; v_generation INTEGER;
BEGIN
  SELECT account.email INTO v_email FROM public.organization_memberships AS membership
    JOIN public.users AS account ON account.id=membership.user_id WHERE membership.id=p_member AND membership.organization_id=p_org;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED'; END IF;
  SELECT user_id INTO v_actor_user FROM public.organization_memberships WHERE id=p_actor AND organization_id=p_org;
  PERFORM public.staff_onboarding_lock_identity(v_actor_user,v_email);
  v_actor_role := public.staff_onboarding_authorize_actor(p_actor,p_org);
  PERFORM public.staff_onboarding_authorize_target(p_actor,p_org,p_member,v_actor_role);
  IF p_operation IS NULL OR p_fingerprint IS NULL OR p_hash IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REQUEST_INVALID';
  END IF;
  SELECT * INTO v_row FROM public.staff_onboarding_invitations AS prior WHERE prior.organization_id=p_org AND prior.operation_id=p_operation;
  IF FOUND THEN
    IF v_row.request_fingerprint <> p_fingerprint OR v_row.membership_id <> p_member THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN QUERY SELECT p_member,v_row.id,v_row.generation,v_row.expires_at,FALSE; RETURN;
  END IF;
  PERFORM invitation.id FROM public.staff_onboarding_invitations AS invitation
    WHERE invitation.membership_id=p_member ORDER BY invitation.generation FOR UPDATE;
  SELECT max(invitation.generation)+1 INTO v_generation FROM public.staff_onboarding_invitations AS invitation WHERE invitation.membership_id=p_member;
  IF v_generation IS NULL OR EXISTS(SELECT 1 FROM public.staff_onboarding_invitations AS invitation WHERE invitation.membership_id=p_member AND invitation.consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ONBOARDING_UNAVAILABLE';
  END IF;
  UPDATE public.staff_onboarding_invitations AS invitation SET revoked_at=clock_timestamp()
    WHERE invitation.membership_id=p_member AND invitation.consumed_at IS NULL AND invitation.revoked_at IS NULL;
  v_row := public.staff_onboarding_append_invitation(p_actor,p_org,p_member,p_operation,p_fingerprint,p_hash,v_generation,'STAFF_ONBOARDING_INVITATION_RESENT');
  RETURN QUERY SELECT p_member,v_row.id,v_row.generation,v_row.expires_at,TRUE;
END;
$$;

CREATE FUNCTION public.staff_onboarding_guard_audit() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.event_type IN ('STAFF_ONBOARDING_INVITATION_ISSUED','STAFF_ONBOARDING_INVITATION_RESENT')
    AND current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.audit_events'::regclass) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHORIZATION_DENIED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_events_staff_onboarding_guard BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.staff_onboarding_guard_audit();

REVOKE ALL ON TABLE public.staff_onboarding_invitations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_proof_current(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_lock_identity(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_authorize_actor(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_authorize_target(UUID,UUID,UUID,public.membership_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_append_invitation(UUID,UUID,UUID,UUID,TEXT,TEXT,INTEGER,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_create(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,public.membership_role,UUID[],TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_resend(UUID,UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_onboarding_guard_audit() FROM PUBLIC;

-- Preserve 050 commands verbatim except pending quarantine before no-op/write.
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
    IF NOT FOUND OR target.status::text = 'PENDING' THEN
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
    IF NOT FOUND OR target.status::text = 'PENDING' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;
    IF actor_role = 'LOCATION_MANAGER'
       AND NOT public.staff_management_lm_target_covered(
         p_actor_membership_id, p_organization_id, p_membership_id)
    THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHORIZATION_DENIED';
    END IF;

    IF p_status IS NULL OR p_status::text NOT IN ('ACTIVE','INACTIVE') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REQUEST_INVALID';
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
    IF NOT FOUND OR target.status::text = 'PENDING' THEN
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

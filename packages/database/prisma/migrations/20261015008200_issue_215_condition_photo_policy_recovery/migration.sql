-- #292: Optional marker -> REQUIRED policy recovery, forward only.
-- Existing #215 P1 functions were deployed with the old marker-null predicate.
-- Replace the same signatures; do not edit or rewrite P1's applied migration.
-- This never promotes old metadata into trusted verified byte evidence.
BEGIN;

-- Session is already locked FOR UPDATE by each caller. The two policy rows
-- are held FOR SHARE until transaction end so a concurrent settings write
-- cannot flip REQUIRED to OPTIONAL between admission and qualification.
-- Existing marker is never rewritten, and no new session/Task state exists.
CREATE FUNCTION public.condition_photo_session_open_for_upload(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_eligible BOOLEAN;
BEGIN
  SELECT s.state = 'CHECKING_IN' AND
    (s.check_in_condition_completed_at IS NULL OR
     COALESCE(l.check_in_photos_required_override, o.check_in_photos_required))
  INTO v_eligible
  FROM public.valet_sessions s
  JOIN public.organizations o ON o.id = s.organization_id
  JOIN public.locations l ON l.id = s.location_id
    AND l.organization_id = s.organization_id
  WHERE s.id = p_session_id
  FOR SHARE OF o, l;
  RETURN COALESCE(v_eligible, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.condition_photo_authorized_scope(
  p_user_id UUID, p_membership_id UUID, p_session_id UUID)
RETURNS TABLE(organization_id UUID, location_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.organization_id, s.location_id
  FROM public.valet_sessions s
  JOIN public.organization_memberships m ON m.id = p_membership_id
    AND m.organization_id = s.organization_id AND m.user_id = p_user_id
    AND m.status = 'ACTIVE'
    AND m.role IN ('VALET_EMPLOYEE', 'VALET_SUPERVISOR')
  JOIN public.membership_location_access mla
    ON mla.organization_id = s.organization_id
    AND mla.location_id = s.location_id
    AND mla.membership_id = m.id
  JOIN public.users u ON u.id = m.user_id AND u.status = 'ACTIVE'
  JOIN public.organizations o ON o.id = s.organization_id AND o.status = 'ACTIVE'
  JOIN public.locations l ON l.id = s.location_id
    AND l.organization_id = s.organization_id AND l.status = 'ACTIVE'
  WHERE s.id = p_session_id AND s.state = 'CHECKING_IN'
    AND (s.check_in_condition_completed_at IS NULL
      OR COALESCE(l.check_in_photos_required_override, o.check_in_photos_required));
$$;

CREATE OR REPLACE FUNCTION public.condition_photo_reserve_upload(
  p_user_id UUID, p_membership_id UUID, p_session_id UUID,
  p_client_operation_id UUID, p_source_sha256 BYTEA,
  p_source_byte_size INTEGER, p_normalization_version INTEGER, p_bucket_alias TEXT)
RETURNS TABLE(operation_id UUID, attempt_id UUID, object_key TEXT,
  lease_owner UUID, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_org UUID;
DECLARE v_loc UUID;
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT s.organization_id, s.location_id INTO v_org, v_loc
    FROM public.condition_photo_authorized_scope(
      p_user_id, p_membership_id, p_session_id) s;
  IF NOT FOUND OR p_client_operation_id IS NULL
    OR octet_length(p_source_sha256) <> 32
    OR p_source_byte_size NOT BETWEEN 1 AND 8388608
    OR p_normalization_version NOT BETWEEN 1 AND 32767
    OR p_bucket_alias !~ '^[a-z][a-z0-9_-]{0,59}$' THEN
    RAISE EXCEPTION 'Condition photo reserve not authorized or invalid'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.condition_photo_lock_admission(p_user_id);
  PERFORM 1 FROM public.valet_sessions
    WHERE id = p_session_id AND state = 'CHECKING_IN' FOR UPDATE;
  -- Hold current policy rows until commit; a completed optional marker
  -- admits recovery only while effective photo policy is REQUIRED.
  IF FOUND THEN
    PERFORM 1 WHERE public.condition_photo_session_open_for_upload(p_session_id);
  END IF;
  IF NOT FOUND THEN
      RAISE EXCEPTION 'Condition photo session no longer eligible' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, p_session_id)
    WHERE organization_id = v_org AND location_id = v_loc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo actor authority changed' USING ERRCODE = '42501';
  END IF;
  v_now := clock_timestamp();

  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE actor_membership_id = p_membership_id
      AND client_operation_id = p_client_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_op.organization_id <> v_org OR v_op.location_id <> v_loc
      OR v_op.valet_session_id <> p_session_id
      OR v_op.source_sha256 <> p_source_sha256
      OR v_op.source_byte_size <> p_source_byte_size
      OR v_op.normalization_version <> p_normalization_version
      OR v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
      RAISE EXCEPTION 'Condition photo replay conflict' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts a
      WHERE a.operation_id = v_op.id AND a.status IN ('WRITING', 'STORED')
        AND a.lease_expires_at > v_now;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Condition photo operation requires explicit reconcile'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    PERFORM public.condition_photo_check_capacity(p_user_id);
    INSERT INTO public.condition_photo_upload_operations (
      id, client_operation_id, organization_id, location_id, valet_session_id,
      actor_membership_id, purpose, source_sha256, source_byte_size,
      normalization_version, status, created_at, expires_at, updated_at, next_attempt_number
    ) VALUES (
      gen_random_uuid(), p_client_operation_id, v_org, v_loc, p_session_id,
      p_membership_id, 'CHECK_IN_CONDITION', p_source_sha256, p_source_byte_size,
      p_normalization_version, 'PENDING', v_now, v_now + interval '30 minutes', v_now, 2
    ) RETURNING * INTO v_op;
    INSERT INTO public.condition_photo_upload_attempts (
      id, operation_id, organization_id, location_id, valet_session_id,
      actor_membership_id, attempt_number, object_key, bucket_alias, status,
      lease_owner, lease_expires_at, normalization_version, created_at
    ) SELECT a.id, v_op.id, v_org, v_loc, p_session_id, p_membership_id,
      1, 'condition-photo/' || v_op.id || '/' || a.id, p_bucket_alias,
      'WRITING', gen_random_uuid(), v_now + interval '120 seconds',
      p_normalization_version, v_now
      FROM (SELECT gen_random_uuid() AS id) a RETURNING * INTO v_attempt;
  END IF;
  RETURN QUERY SELECT v_op.id, v_attempt.id, v_attempt.object_key,
    v_attempt.lease_owner, v_attempt.lease_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.condition_photo_claim_upload(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_reconcile_existing BOOLEAN, p_bucket_alias TEXT)
RETURNS TABLE(operation_id UUID, attempt_id UUID, object_key TEXT,
  lease_owner UUID, lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  PERFORM public.condition_photo_lock_admission(p_user_id);
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo recovery scope denied' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN' FOR UPDATE;
  -- Hold current policy rows until commit; a completed optional marker
  -- admits recovery only while effective photo policy is REQUIRED.
  IF FOUND THEN
    PERFORM 1 WHERE public.condition_photo_session_open_for_upload(v_op.valet_session_id);
  END IF;
  v_now := clock_timestamp();
  IF NOT FOUND OR v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation not recoverable'
      USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo recovery authority changed'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation no longer recoverable'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts a
    WHERE a.operation_id = v_op.id AND a.status IN ('WRITING', 'STORED')
    FOR UPDATE;
  IF FOUND AND v_attempt.lease_expires_at > v_now THEN
    RAISE EXCEPTION 'Condition photo attempt still leased' USING ERRCODE = '55P03';
  END IF;
  PERFORM public.condition_photo_check_capacity(p_user_id);
  IF p_reconcile_existing AND v_attempt.id IS NULL THEN
    RAISE EXCEPTION 'Condition photo has no stored object to reconcile'
      USING ERRCODE = '55000';
  END IF;
  IF p_reconcile_existing THEN
    UPDATE public.condition_photo_upload_attempts SET
      lease_owner = gen_random_uuid(),
      lease_expires_at = LEAST(v_op.expires_at, v_now + interval '120 seconds')
      WHERE id = v_attempt.id RETURNING * INTO v_attempt;
  ELSE
    IF p_bucket_alias IS NULL OR p_bucket_alias !~ '^[a-z][a-z0-9_-]{0,59}$' THEN
      RAISE EXCEPTION 'Condition photo bucket alias invalid' USING ERRCODE = '22023';
    END IF;
    IF v_attempt.id IS NOT NULL THEN
      UPDATE public.condition_photo_upload_attempts SET
        status = 'ABANDONED', abandoned_at = v_now,
        lease_owner = NULL, lease_expires_at = NULL
        WHERE id = v_attempt.id;
    END IF;
    INSERT INTO public.condition_photo_upload_attempts (
      id, operation_id, organization_id, location_id, valet_session_id,
      actor_membership_id, attempt_number, object_key, bucket_alias, status,
      lease_owner, lease_expires_at, normalization_version, created_at
    ) SELECT a.id, v_op.id, v_op.organization_id, v_op.location_id,
      v_op.valet_session_id, v_op.actor_membership_id,
      v_op.next_attempt_number, 'condition-photo/' || v_op.id || '/' || a.id,
      p_bucket_alias, 'WRITING', gen_random_uuid(),
      LEAST(v_op.expires_at, v_now + interval '120 seconds'),
      v_op.normalization_version, v_now
      FROM (SELECT gen_random_uuid() AS id) a RETURNING * INTO v_attempt;
    UPDATE public.condition_photo_upload_operations
      SET next_attempt_number = next_attempt_number + 1, updated_at = v_now
      WHERE id = v_op.id;
  END IF;
  RETURN QUERY SELECT v_op.id, v_attempt.id, v_attempt.object_key,
    v_attempt.lease_owner, v_attempt.lease_expires_at;
END;
$$;

-- Private helper restriction applies before later entrypoint replacements.
REVOKE ALL ON FUNCTION public.condition_photo_session_open_for_upload(UUID) FROM PUBLIC;
COMMIT;

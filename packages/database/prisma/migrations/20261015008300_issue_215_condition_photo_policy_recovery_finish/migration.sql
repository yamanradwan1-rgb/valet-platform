-- #292 continued: same restricted mark/failure/finalize signatures; additive revision.
BEGIN;

CREATE OR REPLACE FUNCTION public.condition_photo_mark_stored(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_attempt_id UUID, p_lease_owner UUID, p_object_version TEXT,
  p_canonical_sha256 BYTEA, p_canonical_byte_size INTEGER,
  p_width INTEGER, p_height INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN' FOR UPDATE;
  -- Hold current policy rows until commit; a completed optional marker
  -- admits recovery only while effective photo policy is REQUIRED.
  IF FOUND THEN
    PERFORM 1 WHERE public.condition_photo_session_open_for_upload(v_op.valet_session_id);
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo session cannot store' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo storage scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation cannot store' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id AND operation_id = v_op.id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status NOT IN ('WRITING', 'STORED')
    OR p_lease_owner IS NULL OR v_attempt.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_attempt.lease_expires_at <= clock_timestamp()
    OR octet_length(p_canonical_sha256) <> 32
    OR p_canonical_byte_size NOT BETWEEN 1 AND 8388608
    OR p_width NOT BETWEEN 1 AND 4096 OR p_height NOT BETWEEN 1 AND 4096
    OR p_width::BIGINT * p_height::BIGINT > 12000000
    OR (p_object_version IS NOT NULL AND
      (char_length(p_object_version) NOT BETWEEN 1 AND 240
        OR p_object_version ~ '[[:cntrl:]]')) THEN
    RAISE EXCEPTION 'Condition photo storage facts invalid or lease stale'
      USING ERRCODE = '55000';
  END IF;
  IF v_attempt.status = 'STORED' THEN
    IF ROW(v_attempt.object_version, v_attempt.canonical_sha256,
      v_attempt.canonical_byte_size, v_attempt.width, v_attempt.height)
      IS DISTINCT FROM ROW(p_object_version, p_canonical_sha256,
        p_canonical_byte_size, p_width, p_height) THEN
      RAISE EXCEPTION 'Condition photo stored bytes conflict' USING ERRCODE = '23505';
    END IF;
    RETURN FALSE;
  END IF;
  UPDATE public.condition_photo_upload_attempts
    SET status = 'STORED', stored_at = v_now,
      object_version = p_object_version, canonical_sha256 = p_canonical_sha256,
      canonical_byte_size = p_canonical_byte_size, width = p_width, height = p_height
    WHERE id = v_attempt.id;
  UPDATE public.condition_photo_upload_operations
    SET last_failure_code = NULL, updated_at = v_now WHERE id = v_op.id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.condition_photo_record_failure(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_attempt_id UUID, p_lease_owner UUID, p_safe_error_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  IF p_safe_error_code IS NULL OR p_safe_error_code NOT IN (
    'STORAGE_UNAVAILABLE', 'STORAGE_TIMEOUT', 'STORAGE_OUTCOME_UNKNOWN',
    'READBACK_UNAVAILABLE', 'VERIFIER_UNAVAILABLE'
  ) THEN
    RAISE EXCEPTION 'Condition photo failure reason invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN' FOR UPDATE;
  -- Hold current policy rows until commit; a completed optional marker
  -- admits recovery only while effective photo policy is REQUIRED.
  IF FOUND THEN
    PERFORM 1 WHERE public.condition_photo_session_open_for_upload(v_op.valet_session_id);
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo session cannot record failure' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo failure scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo operation cannot record failure' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id AND operation_id = v_op.id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'WRITING'
    OR p_lease_owner IS NULL OR v_attempt.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_attempt.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Condition photo failure lease invalid' USING ERRCODE = '55000';
  END IF;
  IF v_op.last_failure_code IS NOT DISTINCT FROM p_safe_error_code THEN
    RETURN FALSE;
  END IF;
  UPDATE public.condition_photo_upload_operations
    SET last_failure_code = p_safe_error_code, updated_at = v_now
    WHERE id = v_op.id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.condition_photo_finalize_upload(
  p_user_id UUID, p_membership_id UUID, p_operation_id UUID,
  p_attempt_id UUID, p_lease_owner UUID, p_object_version TEXT,
  p_canonical_sha256 BYTEA, p_canonical_byte_size INTEGER,
  p_width INTEGER, p_height INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_photo_id UUID;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo operation not found' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.valet_sessions
    WHERE id = v_op.valet_session_id AND state = 'CHECKING_IN' FOR UPDATE;
  -- Hold current policy rows until commit; a completed optional marker
  -- admits recovery only while effective photo policy is REQUIRED.
  IF FOUND THEN
    PERFORM 1 WHERE public.condition_photo_session_open_for_upload(v_op.valet_session_id);
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo session cannot finalize' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM public.condition_photo_authorized_scope(
    p_user_id, p_membership_id, v_op.valet_session_id)
    WHERE organization_id = v_op.organization_id AND location_id = v_op.location_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condition photo finalization scope denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.condition_photo_upload_operations
    WHERE id = p_operation_id AND actor_membership_id = p_membership_id FOR UPDATE;
  IF v_op.status = 'VERIFIED' THEN
    IF EXISTS (
      SELECT 1 FROM public.vehicle_photo_verifications
      WHERE operation_id = v_op.id AND attempt_id = p_attempt_id
    ) THEN
      RETURN v_op.verified_photo_id;
    END IF;
    RAISE EXCEPTION 'Condition photo already verified with another attempt'
      USING ERRCODE = '23505';
  END IF;
  v_now := clock_timestamp();
  IF v_op.status <> 'PENDING' OR v_op.expires_at <= v_now THEN
    RAISE EXCEPTION 'Condition photo expired operation' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_attempt FROM public.condition_photo_upload_attempts
    WHERE id = p_attempt_id AND operation_id = v_op.id FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'STORED'
    OR v_attempt.lease_owner IS DISTINCT FROM p_lease_owner
    OR v_attempt.lease_expires_at <= clock_timestamp()
    OR p_lease_owner IS NULL
    OR v_attempt.object_version IS DISTINCT FROM p_object_version
    OR v_attempt.canonical_sha256 IS DISTINCT FROM p_canonical_sha256
    OR v_attempt.canonical_byte_size IS DISTINCT FROM p_canonical_byte_size
    OR v_attempt.width IS DISTINCT FROM p_width
    OR v_attempt.height IS DISTINCT FROM p_height THEN
    RAISE EXCEPTION 'Condition photo invalid verification or stale lease'
      USING ERRCODE = '55000';
  END IF;
  IF (SELECT count(*) FROM public.vehicle_photo_verifications
      WHERE organization_id = v_op.organization_id
        AND location_id = v_op.location_id
        AND valet_session_id = v_op.valet_session_id
        AND purpose = 'CHECK_IN_CONDITION') >= 10 THEN
    RAISE EXCEPTION 'Condition photo session maximum reached' USING ERRCODE = '53300';
  END IF;
  v_photo_id := gen_random_uuid();
  UPDATE public.condition_photo_upload_attempts SET
    status = 'SELECTED', selected_at = v_now,
    lease_owner = NULL, lease_expires_at = NULL
    WHERE id = v_attempt.id;
  INSERT INTO public.vehicle_photos (
    id, organization_id, location_id, valet_session_id,
    captured_by_membership_id, purpose, storage_object_key,
    content_type, created_at
  ) VALUES (v_photo_id, v_op.organization_id, v_op.location_id,
    v_op.valet_session_id, p_membership_id, 'CHECK_IN_CONDITION',
    v_attempt.object_key, 'image/jpeg', v_now);
  INSERT INTO public.vehicle_photo_verifications (
    vehicle_photo_id, operation_id, attempt_id, organization_id, location_id,
    valet_session_id, captured_by_membership_id, purpose, object_key,
    verified_at, byte_size, content_sha256, width, height, normalization_version
  ) VALUES (v_photo_id, v_op.id, v_attempt.id, v_op.organization_id,
    v_op.location_id, v_op.valet_session_id, p_membership_id,
    'CHECK_IN_CONDITION', v_attempt.object_key, v_now,
    p_canonical_byte_size, p_canonical_sha256, p_width, p_height,
    v_op.normalization_version);
  INSERT INTO public.vehicle_photo_availability (
    vehicle_photo_id, organization_id, location_id, valet_session_id,
    state, changed_at
  ) VALUES (v_photo_id, v_op.organization_id, v_op.location_id,
    v_op.valet_session_id, 'AVAILABLE', v_now);
  UPDATE public.condition_photo_upload_operations
    SET status = 'VERIFIED', verified_photo_id = v_photo_id, updated_at = v_now
    WHERE id = v_op.id;
  INSERT INTO public.audit_events (
    id, organization_id, location_id, valet_session_id, actor_membership_id,
    actor_type, event_type, entity_type, entity_id, metadata_json,
    idempotency_key, occurred_at
  ) VALUES (gen_random_uuid(), v_op.organization_id, v_op.location_id,
    v_op.valet_session_id, p_membership_id, 'MEMBERSHIP',
    'CHECK_IN_CONDITION_PHOTO_VERIFIED', 'ValetSession', v_op.valet_session_id,
    jsonb_build_object('purpose', 'CHECK_IN_CONDITION',
      'mediaCategory', 'image', 'verificationVersion', 1),
    'condition-photo:' || v_op.id::TEXT, v_now);
  RETURN v_photo_id;
END;
$$;

-- CREATE OR REPLACE preserves the already restricted function grants.
COMMIT;

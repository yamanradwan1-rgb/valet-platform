-- #309: final exact identity/evidence lock after byte verification, with no I/O.
-- The dedicated NOLOGIN owner must be installed by the guarded provisioning step
-- before any runtime role can EXECUTE this function. Keep the creation atomic.
BEGIN;

CREATE FUNCTION public.condition_photo_lock_management_evidence(
  p_photo_id UUID, p_organization_id UUID, p_location_id UUID,
  p_session_id UUID, p_operation_id UUID, p_attempt_id UUID,
  p_actor_membership_id UUID, p_object_key TEXT, p_sha256 BYTEA,
  p_byte_size INTEGER, p_bucket_alias TEXT, p_object_version TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_photo_id IS NULL OR p_organization_id IS NULL OR
     p_location_id IS NULL OR p_session_id IS NULL OR
     p_operation_id IS NULL OR p_attempt_id IS NULL OR
     p_actor_membership_id IS NULL OR p_object_key IS NULL OR p_object_key = '' OR
     p_sha256 IS NULL OR octet_length(p_sha256) <> 32 OR
     p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 8388608 OR
     p_bucket_alias IS NULL OR p_bucket_alias = '' OR p_object_version IS NULL OR
     length(p_object_version) = 0 THEN
    RETURN FALSE;
  END IF;

  -- #215 operation writers lock operation before attempt. Hold each acquired
  -- row through the calling READ COMMITTED transaction's response enqueue.
  PERFORM 1 FROM public.condition_photo_upload_operations AS o
   WHERE o.id = p_operation_id AND o.organization_id = p_organization_id
     AND o.location_id = p_location_id AND o.valet_session_id = p_session_id
     AND o.actor_membership_id = p_actor_membership_id
     AND o.purpose = 'CHECK_IN_CONDITION' AND o.status = 'VERIFIED'
     AND o.verified_photo_id = p_photo_id
   FOR SHARE OF o;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  PERFORM 1 FROM public.condition_photo_upload_attempts AS a
   WHERE a.id = p_attempt_id AND a.operation_id = p_operation_id
     AND a.organization_id = p_organization_id AND a.location_id = p_location_id
     AND a.valet_session_id = p_session_id
     AND a.actor_membership_id = p_actor_membership_id
     AND a.status = 'SELECTED' AND a.object_key = p_object_key
     AND a.canonical_sha256 = p_sha256 AND a.canonical_byte_size = p_byte_size
     AND a.bucket_alias = p_bucket_alias AND a.object_version = p_object_version
   FOR SHARE OF a;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  PERFORM 1 FROM public.vehicle_photo_verifications AS v
   WHERE v.vehicle_photo_id = p_photo_id AND v.operation_id = p_operation_id
     AND v.attempt_id = p_attempt_id
     AND v.organization_id = p_organization_id AND v.location_id = p_location_id
     AND v.valet_session_id = p_session_id
     AND v.captured_by_membership_id = p_actor_membership_id
     AND v.purpose = 'CHECK_IN_CONDITION' AND v.object_key = p_object_key
     AND v.content_sha256 = p_sha256 AND v.byte_size = p_byte_size
   FOR SHARE OF v;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Revocation must serialize against response enqueue on the exact AVAILABLE
  -- row. After a waiting reader wakes, READ COMMITTED sees the revoker's state.
  PERFORM 1 FROM public.vehicle_photo_availability AS av
   WHERE av.vehicle_photo_id = p_photo_id
     AND av.organization_id = p_organization_id AND av.location_id = p_location_id
     AND av.valet_session_id = p_session_id AND av.state = 'AVAILABLE'
   FOR SHARE OF av;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.condition_photo_lock_management_evidence(
  UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,BYTEA,INTEGER,TEXT,TEXT)
  FROM PUBLIC;
COMMIT;

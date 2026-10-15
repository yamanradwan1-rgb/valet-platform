-- #215 P5: private scoped integrity candidates and idempotent SYSTEM fact.
-- No employee impersonation, image fetch/download permission, or byte delete.
BEGIN;

-- Deferred audit verification must retain the trusted migration-owner identity
-- after the maintenance SECURITY DEFINER function returns to its caller.
ALTER FUNCTION public.condition_photo_audit_coherence_guard() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.condition_photo_audit_coherence_guard() FROM PUBLIC;

CREATE FUNCTION public.condition_photo_maintenance_available_candidates(
  p_limit INTEGER, p_after_photo UUID)
RETURNS TABLE(photo_id UUID, object_key TEXT, object_version TEXT,
              byte_size INTEGER, sha256 BYTEA, width INTEGER, height INTEGER,
              bucket_alias TEXT, availability TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Condition photo integrity batch invalid' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    SELECT v.vehicle_photo_id, v.object_key, a.object_version,
           v.byte_size, v.content_sha256, v.width, v.height,
           a.bucket_alias, va.state::TEXT
    FROM public.vehicle_photo_verifications v
    JOIN public.vehicle_photo_availability va
      ON va.vehicle_photo_id=v.vehicle_photo_id
      AND va.organization_id=v.organization_id
      AND va.location_id=v.location_id
      AND va.valet_session_id=v.valet_session_id
    JOIN public.condition_photo_upload_operations o
      ON o.id=v.operation_id AND o.organization_id=v.organization_id
      AND o.location_id=v.location_id AND o.valet_session_id=v.valet_session_id
      AND o.actor_membership_id=v.captured_by_membership_id
    JOIN public.condition_photo_upload_attempts a
      ON a.id=v.attempt_id AND a.operation_id=o.id
      AND a.object_key=v.object_key AND a.status='SELECTED'
    WHERE o.status='VERIFIED' AND o.verified_photo_id=v.vehicle_photo_id
      AND v.purpose='CHECK_IN_CONDITION' AND va.state='AVAILABLE'
      AND a.object_version IS NOT NULL
      AND (p_after_photo IS NULL OR v.vehicle_photo_id > p_after_photo)
    ORDER BY v.vehicle_photo_id LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.condition_photo_maintenance_mark_unavailable(
  p_photo_id UUID, p_reason TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_verification public.vehicle_photo_verifications%ROWTYPE;
DECLARE v_availability public.vehicle_photo_availability%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  IF p_photo_id IS NULL OR p_reason NOT IN ('MISSING_OBJECT','CONTENT_MISMATCH')
      OR p_reason IS NULL THEN
    RAISE EXCEPTION 'Condition photo integrity reason invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_verification FROM public.vehicle_photo_verifications
    WHERE vehicle_photo_id=p_photo_id AND purpose='CHECK_IN_CONDITION';
  IF NOT FOUND THEN RETURN FALSE; END IF;
  SELECT * INTO v_availability FROM public.vehicle_photo_availability
    WHERE vehicle_photo_id=p_photo_id
      AND organization_id=v_verification.organization_id
      AND location_id=v_verification.location_id
      AND valet_session_id=v_verification.valet_session_id FOR UPDATE;
  IF NOT FOUND OR v_availability.state <> 'AVAILABLE' THEN RETURN FALSE; END IF;

  -- The immutable selected linkage is checked again while availability is locked.
  PERFORM 1 FROM public.condition_photo_upload_operations o
    JOIN public.condition_photo_upload_attempts a
      ON a.operation_id=o.id AND a.id=v_verification.attempt_id
    WHERE o.id=v_verification.operation_id AND o.status='VERIFIED'
      AND o.verified_photo_id=v_verification.vehicle_photo_id
      AND a.status='SELECTED' AND a.object_key=v_verification.object_key;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  v_now:=clock_timestamp();
  UPDATE public.vehicle_photo_availability
    SET state='UNAVAILABLE', reason=p_reason,changed_at=v_now
    WHERE vehicle_photo_id=p_photo_id;
  INSERT INTO public.audit_events (
    id,organization_id,location_id,valet_session_id,actor_membership_id,
    actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
  VALUES (gen_random_uuid(),v_verification.organization_id,
    v_verification.location_id,v_verification.valet_session_id,NULL,
    'SYSTEM','CHECK_IN_CONDITION_PHOTO_UNAVAILABLE','ValetSession',
    v_verification.valet_session_id,jsonb_build_object('reason',p_reason),v_now);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.condition_photo_maintenance_available_candidates(INTEGER,UUID)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_maintenance_mark_unavailable(UUID,TEXT)
  FROM PUBLIC;
COMMIT;

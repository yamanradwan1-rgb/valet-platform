-- #215 P5: narrowly scoped worker expiry and durable ABANDONED inspection.
-- No S3 delete capability or retention/hold disposition is granted here.
BEGIN;

-- DEFERRABLE constraint triggers fire after the SECURITY DEFINER entrypoint
-- has returned. They otherwise run under the restricted invoker and cannot
-- read their own protected journal. Keep fixed search_path and EXECUTE denied.
ALTER FUNCTION public.condition_photo_coherence_guard() SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.condition_photo_coherence_guard() FROM PUBLIC;

CREATE TABLE public.condition_photo_cleanup_claims (
  attempt_id UUID PRIMARY KEY REFERENCES public.condition_photo_upload_attempts(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  claim_id UUID NOT NULL UNIQUE,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  lease_expires_at TIMESTAMPTZ(3) NOT NULL,
  changed_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX condition_photo_cleanup_claims_lease_idx
  ON public.condition_photo_cleanup_claims(lease_expires_at, attempt_id);
REVOKE ALL ON TABLE public.condition_photo_cleanup_claims FROM PUBLIC;

CREATE FUNCTION public.condition_photo_maintenance_expired_candidates(p_limit INTEGER)
RETURNS TABLE(operation_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Condition photo maintenance batch invalid' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    SELECT o.id FROM public.condition_photo_upload_operations o
    WHERE o.status = 'PENDING' AND o.expires_at <= clock_timestamp()
      AND NOT EXISTS (
        SELECT 1 FROM public.condition_photo_upload_attempts a
        WHERE a.operation_id = o.id AND a.status IN ('WRITING', 'STORED')
          AND a.lease_expires_at > clock_timestamp()
      )
    ORDER BY o.expires_at, o.id LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.condition_photo_maintenance_abandoned_candidates(p_limit INTEGER)
RETURNS TABLE(attempt_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Condition photo maintenance batch invalid' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    SELECT a.id FROM public.condition_photo_upload_attempts a
    JOIN public.condition_photo_upload_operations o ON o.id=a.operation_id
    LEFT JOIN public.condition_photo_cleanup_claims c ON c.attempt_id=a.id
    WHERE a.status='ABANDONED' AND o.status IN ('EXPIRED','REJECTED')
      AND (c.attempt_id IS NULL OR c.lease_expires_at <= clock_timestamp())
      AND NOT EXISTS (SELECT 1 FROM public.vehicle_photo_verifications v
        WHERE v.attempt_id=a.id OR v.object_key=a.object_key)
      AND NOT EXISTS (SELECT 1 FROM public.vehicle_photos p
        WHERE p.storage_object_key=a.object_key)
      AND NOT EXISTS (SELECT 1 FROM public.incidents i
        WHERE i.organization_id=a.organization_id
          AND i.location_id=a.location_id AND i.valet_session_id=a.valet_session_id)
    ORDER BY a.last_cleanup_checked_at NULLS FIRST, a.id LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.condition_photo_maintenance_claim_abandoned(
  p_attempt_id UUID, p_claim_id UUID, p_bucket_alias TEXT)
RETURNS TABLE(attempt_id UUID, operation_id UUID, claim_id UUID,
              bucket_alias TEXT, object_key TEXT, status TEXT,
              selected BOOLEAN, verified BOOLEAN, held BOOLEAN,
              legacy_referenced BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_operation_id UUID;
DECLARE v_op public.condition_photo_upload_operations%ROWTYPE;
DECLARE v_attempt public.condition_photo_upload_attempts%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
DECLARE v_claim UUID;
BEGIN
  IF p_claim_id IS NULL OR p_attempt_id IS NULL OR
     p_bucket_alias IS NULL OR p_bucket_alias !~ '^[a-z][a-z0-9_-]{0,59}$' THEN
    RAISE EXCEPTION 'Condition photo claim invalid' USING ERRCODE='22023';
  END IF;
  SELECT a.operation_id INTO v_operation_id
    FROM public.condition_photo_upload_attempts a WHERE a.id=p_attempt_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT o.* INTO v_op FROM public.condition_photo_upload_operations o
    WHERE o.id=v_operation_id FOR UPDATE;
  SELECT a.* INTO v_attempt FROM public.condition_photo_upload_attempts a
    WHERE a.id=p_attempt_id AND a.operation_id=v_operation_id FOR UPDATE;
  v_now:=clock_timestamp();
  IF NOT FOUND OR v_op.status NOT IN ('EXPIRED','REJECTED') OR
     v_attempt.status <> 'ABANDONED' OR
     v_attempt.lease_owner IS NOT NULL OR v_attempt.lease_expires_at IS NOT NULL OR
     v_attempt.selected_at IS NOT NULL OR
     v_attempt.bucket_alias <> p_bucket_alias OR
     v_attempt.object_key <> 'condition-photo/' || v_op.id::TEXT || '/' || v_attempt.id::TEXT OR
     EXISTS (SELECT 1 FROM public.vehicle_photo_verifications v
       WHERE v.attempt_id=v_attempt.id OR v.object_key=v_attempt.object_key) OR
     EXISTS (SELECT 1 FROM public.vehicle_photos p
       WHERE p.storage_object_key=v_attempt.object_key) OR
     EXISTS (SELECT 1 FROM public.incidents i WHERE
       i.organization_id=v_attempt.organization_id AND
       i.location_id=v_attempt.location_id AND
       i.valet_session_id=v_attempt.valet_session_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.condition_photo_cleanup_claims AS c
      (attempt_id,claim_id,lease_expires_at,changed_at)
    VALUES (v_attempt.id,p_claim_id,v_now+interval '120 seconds',v_now)
    ON CONFLICT ON CONSTRAINT condition_photo_cleanup_claims_pkey DO UPDATE SET
      claim_id=EXCLUDED.claim_id,
      generation=c.generation+1,
      lease_expires_at=EXCLUDED.lease_expires_at,
      changed_at=EXCLUDED.changed_at
    WHERE c.lease_expires_at <= v_now
    RETURNING c.claim_id INTO v_claim;
  IF v_claim IS NULL THEN RETURN; END IF;
  RETURN QUERY SELECT v_attempt.id, v_op.id, v_claim,
    v_attempt.bucket_alias, v_attempt.object_key, 'ABANDONED'::TEXT,
    FALSE, FALSE, FALSE, FALSE;
END;
$$;

CREATE FUNCTION public.condition_photo_maintenance_finish_claim(
  p_attempt_id UUID, p_claim_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_operation_id UUID;
DECLARE v_claim public.condition_photo_cleanup_claims%ROWTYPE;
DECLARE v_now TIMESTAMPTZ;
BEGIN
  SELECT operation_id INTO v_operation_id FROM public.condition_photo_upload_attempts
    WHERE id=p_attempt_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.condition_photo_upload_operations
    WHERE id=v_operation_id FOR UPDATE;
  PERFORM 1 FROM public.condition_photo_upload_attempts
    WHERE id=p_attempt_id AND status='ABANDONED' FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  SELECT * INTO v_claim FROM public.condition_photo_cleanup_claims
    WHERE attempt_id=p_attempt_id FOR UPDATE;
  v_now:=clock_timestamp();
  IF NOT FOUND OR p_claim_id IS NULL OR v_claim.claim_id <> p_claim_id OR
     v_claim.lease_expires_at <= v_now THEN RETURN FALSE; END IF;
  UPDATE public.condition_photo_upload_attempts
    SET last_cleanup_checked_at=v_now WHERE id=p_attempt_id;
  UPDATE public.condition_photo_cleanup_claims
    SET lease_expires_at=v_now,changed_at=v_now WHERE attempt_id=p_attempt_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.condition_photo_maintenance_expired_candidates(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_maintenance_abandoned_candidates(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_maintenance_claim_abandoned(UUID,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condition_photo_maintenance_finish_claim(UUID,UUID) FROM PUBLIC;
COMMIT;

BEGIN;
-- Privileged operator only. Runtime gets neither EXECUTE nor DELETE.
CREATE FUNCTION public.shift_presence_maintain(p_limit INTEGER DEFAULT 1000) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_operation public.shift_presence_operations%ROWTYPE; v_now TIMESTAMPTZ:=clock_timestamp();
  v_expired INTEGER:=0; v_challenges INTEGER:=0; v_operations INTEGER:=0; v_decisions INTEGER:=0; v_exceptions INTEGER:=0;
  v_expired_exceptions INTEGER:=0; v_affected INTEGER:=0;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Presence maintenance batch invalid.';
  END IF;
  FOR v_operation IN SELECT * FROM public.shift_presence_operations
    WHERE status='PENDING' AND expires_at<=v_now ORDER BY expires_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM id FROM public.shift_presence_challenges WHERE operation_row_id=v_operation.id FOR UPDATE;
    UPDATE public.shift_presence_exceptions e SET status='EXPIRED',revision=revision+1,terminal_at=clock_timestamp()
      FROM public.shift_presence_challenges c WHERE c.operation_row_id=v_operation.id AND c.id=e.challenge_id
        AND e.status IN ('PENDING','APPROVED') AND e.expires_at<=clock_timestamp();
    GET DIAGNOSTICS v_affected=ROW_COUNT;
    v_expired_exceptions:=v_expired_exceptions+v_affected;
    UPDATE public.shift_presence_operations SET status='EXPIRED',terminal_at=clock_timestamp() WHERE id=v_operation.id;
    v_expired:=v_expired+1;
  END LOOP;
  -- Independent history survives Challenge purge and terminal Operation outcomes.
  UPDATE public.shift_presence_exceptions SET status='EXPIRED',revision=revision+1,terminal_at=clock_timestamp()
    WHERE id IN (SELECT id FROM public.shift_presence_exceptions
      WHERE status IN ('PENDING','APPROVED') AND expires_at<=v_now
      ORDER BY expires_at,id LIMIT (p_limit-v_expired_exceptions) FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_affected=ROW_COUNT;
  v_expired_exceptions:=v_expired_exceptions+v_affected;
  DELETE FROM public.shift_presence_challenges WHERE id IN (
    SELECT id FROM public.shift_presence_challenges
    WHERE consumed_at IS NOT NULL OR expires_at+INTERVAL '24 hours'<=v_now
    ORDER BY expires_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_challenges=ROW_COUNT;
  DELETE FROM public.shift_presence_operations o WHERE id IN (
    SELECT id FROM public.shift_presence_operations o WHERE terminal_at IS NOT NULL
      AND (terminal_at AT TIME ZONE 'UTC')+INTERVAL '90 days'<=(v_now AT TIME ZONE 'UTC')
      AND NOT EXISTS (SELECT 1 FROM public.shift_presence_challenges c WHERE c.operation_row_id=o.id)
    ORDER BY terminal_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_operations=ROW_COUNT;
  DELETE FROM public.shift_presence_decisions WHERE id IN (
    SELECT d.id FROM public.shift_presence_decisions d
      WHERE (decided_at AT TIME ZONE 'UTC')+INTERVAL '24 months'<=(v_now AT TIME ZONE 'UTC')
        AND NOT EXISTS (SELECT 1 FROM public.shift_presence_operations o WHERE o.result_decision_id=d.id)
        AND NOT EXISTS (SELECT 1 FROM public.shift_presence_challenges c WHERE c.decision_id=d.id)
      ORDER BY decided_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_decisions=ROW_COUNT;
  DELETE FROM public.shift_presence_exceptions e WHERE id IN (
    SELECT id FROM public.shift_presence_exceptions e WHERE terminal_at IS NOT NULL
      AND (terminal_at AT TIME ZONE 'UTC')+INTERVAL '24 months'<=(v_now AT TIME ZONE 'UTC')
      AND NOT EXISTS (SELECT 1 FROM public.shift_presence_decisions d WHERE d.exception_id=e.id)
      ORDER BY terminal_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS v_exceptions=ROW_COUNT;
  RETURN jsonb_build_object('expiredOperations',v_expired,'expiredExceptions',v_expired_exceptions,'purgedChallenges',v_challenges,
    'purgedOperations',v_operations,'purgedDecisions',v_decisions,'purgedExceptions',v_exceptions);
END;
$$;
REVOKE ALL ON FUNCTION public.shift_presence_maintain(INTEGER) FROM PUBLIC;
COMMIT;

-- Owner-authorized Issue #257: exact evidence-free OFF result without invented attendance history.
-- No historical row requires backfill: NULL retains its existing Decision-backed invariant.
BEGIN;
CREATE TYPE public.shift_presence_completion_basis AS ENUM ('OFF_NO_EVIDENCE');
ALTER TABLE public.shift_presence_operations
  ADD COLUMN completion_basis public.shift_presence_completion_basis,
  DROP CONSTRAINT shift_presence_operations_terminal_check,
  ADD CONSTRAINT shift_presence_operations_terminal_check CHECK (
    (status='PENDING' AND terminal_at IS NULL AND result_shift_id IS NULL
      AND result_decision_id IS NULL AND completion_basis IS NULL)
    OR (status<>'PENDING' AND terminal_at IS NOT NULL AND terminal_at>=created_at
      AND (
        (status='COMMITTED' AND request_fingerprint IS NOT NULL AND result_shift_id IS NOT NULL
          AND (
            (completion_basis IS NULL AND result_decision_id IS NOT NULL)
            OR (completion_basis IS NOT NULL AND completion_basis='OFF_NO_EVIDENCE'
              AND result_decision_id IS NULL AND request_policy_fingerprint IS NOT NULL)
          ))
        OR (status IN ('DENIED','EXPIRED') AND result_shift_id IS NULL AND completion_basis IS NULL)
      ))
  );

CREATE FUNCTION public.shift_presence_guard_completion() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_now TIMESTAMPTZ:=clock_timestamp();
BEGIN
  IF NEW.completion_basis IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence completion cannot be supplied at allocation.';
  END IF;
  IF OLD.status<>'PENDING' OR OLD.completion_basis IS NOT NULL OR NEW.status<>'COMMITTED'
    OR NEW.result_decision_id IS NOT NULL OR NEW.result_shift_id IS NULL
    OR OLD.request_fingerprint IS NULL OR OLD.request_policy_fingerprint IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence OFF completion requires a bound pending attempt.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.locations l JOIN public.organizations o ON o.id=l.organization_id
    WHERE l.id=NEW.location_id AND o.id=NEW.organization_id
      AND (CASE WHEN NEW.action='START'
        THEN coalesce(l.shift_start_presence_mode_override,o.shift_start_presence_mode)
        ELSE coalesce(l.shift_end_presence_mode_override,o.shift_end_presence_mode) END)='OFF'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.shift_presence_challenges c
    WHERE c.operation_row_id=OLD.id AND c.consumed_at IS NULL AND c.expires_at>v_now
      AND (c.organization_id,c.location_id,c.user_id,c.membership_id,c.action)
        =(NEW.organization_id,NEW.location_id,NEW.user_id,NEW.membership_id,NEW.action)
      AND c.shift_id IS NOT DISTINCT FROM NEW.shift_id
  ) OR EXISTS (
    SELECT 1 FROM public.shift_presence_decisions d
    WHERE d.operation_id=NEW.operation_id AND d.user_id=NEW.user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE (s.id,s.organization_id,s.location_id,s.membership_id)
      =(NEW.result_shift_id,NEW.organization_id,NEW.location_id,NEW.membership_id)
      AND ((NEW.action='START' AND s.status='ACTIVE')
        OR (NEW.action='END' AND s.id=NEW.shift_id AND s.status='ENDED' AND s.cash_reported_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence OFF completion provenance mismatch.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shift_presence_operations_completion_guard
  BEFORE INSERT OR UPDATE ON public.shift_presence_operations
  FOR EACH ROW EXECUTE FUNCTION public.shift_presence_guard_completion();
REVOKE ALL ON FUNCTION public.shift_presence_guard_completion() FROM PUBLIC;
COMMIT;

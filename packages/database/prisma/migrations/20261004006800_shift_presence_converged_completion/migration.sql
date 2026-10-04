-- Owner follow-up: a successful already-satisfied result is not a new Shift effect.
-- Commit the new enum label before using it in constraints/function bodies.
BEGIN;
ALTER TYPE public.shift_presence_completion_basis ADD VALUE 'NO_EFFECT_CONVERGENCE';
COMMIT;
BEGIN;
ALTER TABLE public.shift_presence_operations
  DROP CONSTRAINT shift_presence_operations_terminal_check,
  ADD CONSTRAINT shift_presence_operations_terminal_check CHECK (
    (status='PENDING' AND terminal_at IS NULL AND result_shift_id IS NULL
      AND result_decision_id IS NULL AND completion_basis IS NULL)
    OR (status<>'PENDING' AND terminal_at IS NOT NULL AND terminal_at>=created_at
      AND (
        (status='COMMITTED' AND request_fingerprint IS NOT NULL AND result_shift_id IS NOT NULL
          AND (
            (completion_basis IS NULL AND result_decision_id IS NOT NULL)
            OR (completion_basis IS NOT NULL
              AND completion_basis IN ('OFF_NO_EVIDENCE','NO_EFFECT_CONVERGENCE')
              AND result_decision_id IS NULL AND request_policy_fingerprint IS NOT NULL)
          ))
        OR (status IN ('DENIED','EXPIRED') AND result_shift_id IS NULL AND completion_basis IS NULL)
      ))
  );

CREATE OR REPLACE FUNCTION public.shift_presence_guard_completion() RETURNS TRIGGER
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
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence completion requires a bound pending attempt.';
  END IF;
  IF NOT EXISTS (
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
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence completion provenance mismatch.';
  END IF;
  -- Convergence carries no evidence/effect assertion and does not depend on mode.
  -- The original OFF mutation basis must still be supported by current OFF policy.
  IF NEW.completion_basis='OFF_NO_EVIDENCE' AND NOT EXISTS (
    SELECT 1 FROM public.locations l JOIN public.organizations o ON o.id=l.organization_id
    WHERE l.id=NEW.location_id AND o.id=NEW.organization_id
      AND (CASE WHEN NEW.action='START'
        THEN coalesce(l.shift_start_presence_mode_override,o.shift_start_presence_mode)
        ELSE coalesce(l.shift_end_presence_mode_override,o.shift_end_presence_mode) END)='OFF'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Presence OFF completion policy mismatch.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.shift_presence_guard_completion() FROM PUBLIC;
COMMIT;

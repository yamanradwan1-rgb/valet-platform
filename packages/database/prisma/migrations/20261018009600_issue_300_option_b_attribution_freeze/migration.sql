-- Issue #300 Option B independent P1 review: freeze supplementary attribution.
-- Forward-only addition; migration 95 has already been exercised on owned G2.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.audit_events, public.valet_sessions
  IN ACCESS EXCLUSIVE MODE;

CREATE FUNCTION public.issue300_prevent_attribution_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'audit_events' THEN
    IF (OLD.controlled_operator_ref, OLD.idempotency_key)
       IS DISTINCT FROM
       (NEW.controlled_operator_ref, NEW.idempotency_key) THEN
      RAISE EXCEPTION 'ISSUE300_AUDIT_ATTRIBUTION_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'valet_sessions' THEN
    IF (OLD.checked_in_by_membership_id, OLD.created_at)
       IS DISTINCT FROM
       (NEW.checked_in_by_membership_id, NEW.created_at) THEN
      RAISE EXCEPTION 'ISSUE300_SESSION_ORIGIN_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER audit_events_issue300_attribution_immutable
  BEFORE UPDATE ON public.audit_events FOR EACH ROW
  EXECUTE FUNCTION public.issue300_prevent_attribution_rewrite();
CREATE TRIGGER valet_sessions_issue300_origin_immutable
  BEFORE UPDATE ON public.valet_sessions FOR EACH ROW
  EXECUTE FUNCTION public.issue300_prevent_attribution_rewrite();
REVOKE ALL ON FUNCTION public.issue300_prevent_attribution_rewrite()
  FROM PUBLIC;
COMMIT;

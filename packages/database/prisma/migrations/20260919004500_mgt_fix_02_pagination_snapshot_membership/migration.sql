-- MGT-FIX-02: persist the top-level insert transaction used for MVCC page membership.
ALTER TABLE public.audit_events
ADD COLUMN pagination_birth_xid xid8;

ALTER TABLE public.valet_sessions
ADD COLUMN pagination_birth_xid xid8;

ALTER TABLE public.audit_events
ALTER COLUMN pagination_birth_xid
SET DEFAULT pg_current_xact_id();

ALTER TABLE public.valet_sessions
ALTER COLUMN pagination_birth_xid
SET DEFAULT pg_current_xact_id();

CREATE FUNCTION public.management_pagination_preserve_birth_xid()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.pagination_birth_xid := pg_current_xact_id();
  ELSE
    NEW.pagination_birth_xid := OLD.pagination_birth_xid;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER audit_events_pagination_birth_insert
BEFORE INSERT ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

CREATE TRIGGER audit_events_pagination_birth_update
BEFORE UPDATE OF pagination_birth_xid ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

CREATE TRIGGER valet_sessions_pagination_birth_insert
BEFORE INSERT ON public.valet_sessions
FOR EACH ROW EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

CREATE TRIGGER valet_sessions_pagination_birth_update
BEFORE UPDATE OF pagination_birth_xid ON public.valet_sessions
FOR EACH ROW EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

REVOKE ALL ON FUNCTION public.management_pagination_preserve_birth_xid() FROM PUBLIC;

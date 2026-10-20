-- Issue #300 U05 Option A, Owner-approved LOCAL validation only.
-- Atomic legacy/post-activation barrier across all missing source families.
-- Prisma applies this file as one SQL migration; explicit transaction prevents
-- partial activation if the process is interrupted between DDL statements.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- All locks are acquired before any DDL. Concurrent old writers settle before
-- the ADD COLUMN/default/trigger activation becomes visible at COMMIT.
LOCK TABLE public.key_custody_events, public.dispatch_events, public.incidents
  IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.key_custody_events ADD COLUMN pagination_birth_xid xid8;
ALTER TABLE public.dispatch_events ADD COLUMN pagination_birth_xid xid8;
ALTER TABLE public.incidents ADD COLUMN pagination_birth_xid xid8;

ALTER TABLE public.key_custody_events
  ALTER COLUMN pagination_birth_xid SET DEFAULT pg_current_xact_id();
ALTER TABLE public.dispatch_events
  ALTER COLUMN pagination_birth_xid SET DEFAULT pg_current_xact_id();
ALTER TABLE public.incidents
  ALTER COLUMN pagination_birth_xid SET DEFAULT pg_current_xact_id();

-- Reuse the audited migration-45 function: INSERT overwrites explicit NULL
-- and spoofed XIDs; UPDATE preserves the original immutable marker, including
-- the NULL of an existing historical row. No domain event is ever generated.
CREATE TRIGGER key_custody_events_pagination_birth_insert
  BEFORE INSERT ON public.key_custody_events FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();
CREATE TRIGGER key_custody_events_pagination_birth_update
  BEFORE UPDATE OF pagination_birth_xid ON public.key_custody_events FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

CREATE TRIGGER dispatch_events_pagination_birth_insert
  BEFORE INSERT ON public.dispatch_events FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();
CREATE TRIGGER dispatch_events_pagination_birth_update
  BEFORE UPDATE OF pagination_birth_xid ON public.dispatch_events FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

CREATE TRIGGER incidents_pagination_birth_insert
  BEFORE INSERT ON public.incidents FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();
CREATE TRIGGER incidents_pagination_birth_update
  BEFORE UPDATE OF pagination_birth_xid ON public.incidents FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

-- Retain migration-45 least privilege; trigger invocation requires no PUBLIC
-- execute grant. Never elevate the runtime role to the schema owner.
REVOKE ALL ON FUNCTION public.management_pagination_preserve_birth_xid()
  FROM PUBLIC;

COMMIT;

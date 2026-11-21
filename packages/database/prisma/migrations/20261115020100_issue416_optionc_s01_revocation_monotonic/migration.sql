-- Option C / S01: revocation is one-way, even for an otherwise authorized
-- runtime MFA or Auth-writer column update. No legacy migration is rewritten.
CREATE FUNCTION public.staff_auth_session_revocation_monotonic()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'STAFF_AUTH_SESSION_REVOCATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_auth_session_revocation_monotonic() FROM PUBLIC;

CREATE TRIGGER staff_auth_session_revocation_monotonic_trigger
BEFORE UPDATE ON public.staff_auth_sessions
FOR EACH ROW EXECUTE FUNCTION public.staff_auth_session_revocation_monotonic();

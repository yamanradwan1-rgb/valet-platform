BEGIN;
ALTER TABLE public.anti_abuse_events ADD COLUMN request_class TEXT;
ALTER TABLE public.anti_abuse_events ADD CONSTRAINT anti_abuse_events_request_class_check
  CHECK (request_class IS NULL OR (scope='v1:guest-token' AND request_class IN ('A','B','C','D')));
ALTER TABLE public.anti_abuse_events DROP CONSTRAINT anti_abuse_events_scope_check;
ALTER TABLE public.anti_abuse_events ADD CONSTRAINT anti_abuse_events_scope_check CHECK (
  scope IN (
    'v1:staff-login-identifier', 'v1:staff-client-address',
    'v1:guest-client-address', 'v1:guest-token', 'v1:guest-enrollment-address',
    'v1:handoff-issuance-session', 'v1:handoff-verification-session',
    'v1:mfa-totp-user', 'v1:mfa-recovery-user',
    'v1:staff-onboarding-create-organization', 'v1:staff-onboarding-resend-membership',
    'v1:staff-activation-credential', 'v1:staff-activation-client-address',
    'v1:shift-presence-challenge-user', 'v1:shift-presence-exception-user',
    'v1:shift-presence-status-user'
  )
);
-- Fixed retention; no caller may select a key, cutoff, batch or current-window row.
CREATE OR REPLACE FUNCTION public.cleanup_expired_anti_abuse_events()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET lock_timeout = '200ms'
SET statement_timeout = '500ms'
AS $$
DECLARE deleted_count INTEGER;
BEGIN
  IF NOT pg_try_advisory_xact_lock(1875720491, 240024) THEN RETURN 0; END IF;
  WITH candidates AS MATERIALIZED (
    SELECT id FROM public.anti_abuse_events
    WHERE occurred_at < clock_timestamp() - INTERVAL '1 hour'
    ORDER BY occurred_at, id LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.anti_abuse_events AS event USING candidates
  WHERE event.id=candidates.id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_anti_abuse_events() FROM PUBLIC;
COMMIT;

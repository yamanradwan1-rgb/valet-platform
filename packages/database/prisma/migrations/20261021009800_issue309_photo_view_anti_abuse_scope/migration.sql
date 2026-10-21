-- Issue #309: authorize one durable per-user Dashboard photo-view budget scope.
-- Compare the complete PG-parsed predecessor CHECK before replacing it: reject
-- drift rather than silently dropping another migration's scope/policy changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.anti_abuse_events IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE issue309_expected_scope_preflight
  (LIKE public.anti_abuse_events) ON COMMIT DROP;
ALTER TABLE pg_temp.issue309_expected_scope_preflight
  ADD CONSTRAINT issue309_expected_scope_check CHECK (
    scope IN (
      'v1:staff-login-identifier', 'v1:staff-client-address',
      'v1:guest-client-address', 'v1:guest-token', 'v1:guest-enrollment-address',
      'v1:handoff-issuance-session', 'v1:handoff-verification-session',
      'v1:mfa-totp-user', 'v1:mfa-recovery-user',
      'v1:staff-onboarding-create-organization', 'v1:staff-onboarding-resend-membership',
      'v1:staff-activation-credential', 'v1:staff-activation-client-address',
      'v1:shift-presence-challenge-user', 'v1:shift-presence-exception-user',
      'v1:shift-presence-status-user',
      'v1:condition-photo-upload-user', 'v1:condition-photo-upload-session',
      'v1:condition-photo-status-user'
    )
  );

DO $issue309_scope_preflight$
DECLARE
  v_actual TEXT;
  v_expected TEXT;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO v_actual
    FROM pg_catalog.pg_constraint AS c
   WHERE c.conrelid = 'public.anti_abuse_events'::pg_catalog.regclass
     AND c.conname = 'anti_abuse_events_scope_check'
     AND c.contype = 'c' AND c.convalidated;
  SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO v_expected
    FROM pg_catalog.pg_constraint AS c
   WHERE c.conrelid = 'pg_temp.issue309_expected_scope_preflight'::pg_catalog.regclass
     AND c.conname = 'issue309_expected_scope_check'
     AND c.contype = 'c' AND c.convalidated;
  IF v_actual IS NULL OR v_expected IS NULL OR v_actual <> v_expected THEN
    RAISE EXCEPTION 'Issue 309 anti-abuse scope predecessor drift; migration refused'
      USING ERRCODE = '55000';
  END IF;
END;
$issue309_scope_preflight$;

DROP TABLE pg_temp.issue309_expected_scope_preflight;
ALTER TABLE public.anti_abuse_events
  DROP CONSTRAINT anti_abuse_events_scope_check;
ALTER TABLE public.anti_abuse_events
  ADD CONSTRAINT anti_abuse_events_scope_check CHECK (
    scope IN (
      'v1:staff-login-identifier', 'v1:staff-client-address',
      'v1:guest-client-address', 'v1:guest-token', 'v1:guest-enrollment-address',
      'v1:handoff-issuance-session', 'v1:handoff-verification-session',
      'v1:mfa-totp-user', 'v1:mfa-recovery-user',
      'v1:staff-onboarding-create-organization', 'v1:staff-onboarding-resend-membership',
      'v1:staff-activation-credential', 'v1:staff-activation-client-address',
      'v1:shift-presence-challenge-user', 'v1:shift-presence-exception-user',
      'v1:shift-presence-status-user',
      'v1:condition-photo-upload-user', 'v1:condition-photo-upload-session',
      'v1:condition-photo-status-user',
      'v1:dashboard-session-photo-view-user'
    )
  );
COMMIT;

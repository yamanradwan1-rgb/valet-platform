-- Issue #416 R03. Extend only the two approved public attempt scopes.
-- Preserve the exact predecessor; a changed check must be reviewed separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.anti_abuse_events IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE issue416_expected_anti_abuse_scope
  (LIKE public.anti_abuse_events) ON COMMIT DROP;
ALTER TABLE pg_temp.issue416_expected_anti_abuse_scope
  ADD CONSTRAINT issue416_expected_anti_abuse_scope_check CHECK (
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
DO $issue416_scope_preflight$
DECLARE v_actual text; v_expected text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO v_actual
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.anti_abuse_events'::pg_catalog.regclass
    AND c.conname = 'anti_abuse_events_scope_check'
    AND c.contype = 'c' AND c.convalidated;
  SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO v_expected
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'pg_temp.issue416_expected_anti_abuse_scope'::pg_catalog.regclass
    AND c.conname = 'issue416_expected_anti_abuse_scope_check'
    AND c.contype = 'c' AND c.convalidated;
  IF v_actual IS NULL OR v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Issue 416 anti-abuse scope predecessor drift'
      USING ERRCODE = '55000';
  END IF;
END;
$issue416_scope_preflight$;
DROP TABLE pg_temp.issue416_expected_anti_abuse_scope;

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
      'v1:dashboard-session-photo-view-user',
      'v1:staff-password-reset-redeem-client-address',
      'v1:staff-password-reset-redeem-credential'
    )
  );
COMMIT;

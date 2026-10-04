BEGIN;
-- Preserve every existing scope and allow only the three new User-scoped keys.
ALTER TABLE public.anti_abuse_events DROP CONSTRAINT anti_abuse_events_scope_check;
ALTER TABLE public.anti_abuse_events ADD CONSTRAINT anti_abuse_events_scope_check CHECK (
  scope IN (
    'v1:staff-login-identifier', 'v1:staff-client-address',
    'v1:guest-client-address', 'v1:guest-token',
    'v1:handoff-issuance-session', 'v1:handoff-verification-session',
    'v1:mfa-totp-user', 'v1:mfa-recovery-user',
    'v1:staff-onboarding-create-organization', 'v1:staff-onboarding-resend-membership',
    'v1:staff-activation-credential', 'v1:staff-activation-client-address',
    'v1:shift-presence-challenge-user', 'v1:shift-presence-exception-user',
    'v1:shift-presence-status-user'
  )
);
COMMIT;

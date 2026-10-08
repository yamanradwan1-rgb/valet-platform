BEGIN;
ALTER TABLE public.anti_abuse_events ADD COLUMN group_key_hash TEXT;
ALTER TABLE public.anti_abuse_events ADD CONSTRAINT anti_abuse_events_group_key_check
  CHECK (group_key_hash IS NULL OR (scope='v1:guest-token' AND
    group_key_hash ~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'));
COMMIT;

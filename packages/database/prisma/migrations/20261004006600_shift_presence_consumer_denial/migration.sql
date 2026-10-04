-- Owner-authorized GPS-B consumer correction: only minimized terminal outcome.
-- Historical denials remain unknown/null; never infer or retain measurement.
BEGIN;
ALTER TABLE public.shift_presence_operations
  ADD COLUMN denial_classification public.shift_presence_classification,
  ADD COLUMN denial_measurement_reason public.shift_presence_reason,
  ADD CONSTRAINT shift_presence_operations_measurement_denial_check CHECK (
    (denial_classification IS NULL AND denial_measurement_reason IS NULL)
    OR (
      denial_classification IS NOT NULL AND denial_measurement_reason IS NOT NULL
      AND status='DENIED' AND denial_reason IS NOT NULL AND denial_reason='PRESENCE_REJECTED'
      AND request_fingerprint IS NOT NULL AND request_policy_fingerprint IS NOT NULL
      AND (
        (denial_classification='CONFIDENT_OUTSIDE' AND denial_measurement_reason='OUTSIDE')
        OR (denial_classification='AMBIGUOUS_EDGE' AND denial_measurement_reason='EDGE')
        OR (denial_classification='CONFIGURATION_UNUSABLE'
          AND denial_measurement_reason IN ('NO_ACTIVE_ZONE','INVALID_CONFIGURATION'))
        OR (denial_classification='MEASUREMENT_UNUSABLE'
          AND denial_measurement_reason IN ('INVALID_FIX','INACCURATE_FIX','STALE_FIX','FUTURE_FIX'))
      )
    )
  );
-- Existing history/denial triggers reject every UPDATE to terminal Operations,
-- including these columns. Pending results cannot carry a summary under CHECK.
COMMIT;

-- Issue416 R03 P0: the old public limiter remains writable by ordinary runtime
-- SQL (UPDATE state,group_key_hash). Do not treat it as R03 evidence.
-- Preserve those legacy rights for Staff Auth/Guest/readiness; deny ONLY the
-- two R03 public scopes. R03 must use the private 133/134 substrate once an
-- independently authenticated pre-parser binder and scoped ACL exist.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.anti_abuse_events IN ACCESS EXCLUSIVE MODE;

-- A preexisting R03 public attempt has mutable provenance and cannot be
-- imported into trusted private counts or silently discarded. Fail closed
-- instead of altering existing rows, quota history, or evidence.
DO $issue416_r03_untrusted_public$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.anti_abuse_events
    WHERE scope IN (
      'v1:staff-password-reset-redeem-client-address',
      'v1:staff-password-reset-redeem-credential'
    )
  ) THEN
    RAISE EXCEPTION 'VAP1_R03_PUBLIC_HISTORY_UNVERIFIED'
      USING ERRCODE = '42501';
  END IF;
END;
$issue416_r03_untrusted_public$;

-- Additive, independently enforced PostgreSQL CHECK: legacy ordinary runtime
-- can still INSERT/UPDATE/cleanup every other registered scope, but attempts
-- to INSERT either reset-redeem scope are forbidden even if provisioner later
-- restores the original public column grants. No SQL function or signer.
-- NOT VALID avoids an implicit long scan during ADD; explicit VALIDATE below
-- under the same bounded migration transaction ensures no grandfathered rows.
ALTER TABLE public.anti_abuse_events
  ADD CONSTRAINT issue416_r03_public_scope_deny CHECK (scope NOT IN (
    'v1:staff-password-reset-redeem-client-address',
    'v1:staff-password-reset-redeem-credential'
  )) NOT VALID;
ALTER TABLE public.anti_abuse_events
  VALIDATE CONSTRAINT issue416_r03_public_scope_deny;
COMMIT;

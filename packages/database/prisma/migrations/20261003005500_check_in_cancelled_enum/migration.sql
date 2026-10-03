-- DEC-097. Commit the additive enum label before migration 056 uses it.
ALTER TYPE public.valet_session_state ADD VALUE 'CANCELLED';

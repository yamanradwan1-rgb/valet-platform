-- Requires separate operator authorization. Never called by migrate:deploy or application.
-- Use psql -v ON_ERROR_STOP=1 -f against the expressly authorized target, outside a transaction.
-- Inspect a same-name object first; no IF NOT EXISTS that could hide an invalid/wrong index.
DO $$ BEGIN
  IF to_regclass('public.organization_memberships_user_id_id_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'Inspect existing index and canonical migration postflight; do not recreate blindly';
  END IF;
END $$;
CREATE INDEX CONCURRENTLY organization_memberships_user_id_id_idx
  ON public.organization_memberships(user_id,id);
-- Canonical migration 107 independently verifies exact definition, valid/ready and table.

-- Owner-approved #408 C4: account-wide policy locks need every membership status/role.
-- Existing data requires separately authorized concurrent preinstallation; see rollout SQL.
DO $issue408_policy_index$
DECLARE
  expected TEXT := 'CREATE INDEX organization_memberships_user_id_id_idx ON public.organization_memberships USING btree (user_id, id)';
BEGIN
  -- NOWAIT row clauses do not cover relation acquisition: take the relation lock explicitly.
  LOCK TABLE public.organization_memberships IN ACCESS SHARE MODE NOWAIT;
  IF to_regclass('public.organization_memberships_user_id_id_idx') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS i
    WHERE i.indexrelid=to_regclass('public.organization_memberships_user_id_id_idx')
      AND i.indrelid='public.organization_memberships'::regclass
      AND i.indisvalid AND i.indisready AND NOT i.indisunique
      AND pg_catalog.pg_get_indexdef(i.indexrelid)=expected
  ) THEN
    RAISE EXCEPTION 'Issue 408 conflicting or invalid membership policy index';
  END IF;
  IF to_regclass('public.organization_memberships_user_id_id_idx') IS NULL THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Issue 408 bootstrap requires READ COMMITTED';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_memberships LIMIT 1) THEN
      RAISE EXCEPTION 'Issue 408 nonempty memberships require separately authorized online index rollout';
    END IF;
    LOCK TABLE public.organization_memberships IN SHARE ROW EXCLUSIVE MODE NOWAIT;
    IF EXISTS (SELECT 1 FROM public.organization_memberships LIMIT 1) THEN
      RAISE EXCEPTION 'Issue 408 membership bootstrap became nonempty; online rollout required';
    END IF;
    CREATE INDEX organization_memberships_user_id_id_idx ON public.organization_memberships(user_id,id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS i
    WHERE i.indexrelid=to_regclass('public.organization_memberships_user_id_id_idx')
      AND i.indrelid='public.organization_memberships'::regclass
      AND i.indisvalid AND i.indisready AND NOT i.indisunique
      AND pg_catalog.pg_get_indexdef(i.indexrelid)=expected
  ) THEN
    RAISE EXCEPTION 'Issue 408 membership policy index failed postflight';
  END IF;
END;
$issue408_policy_index$;

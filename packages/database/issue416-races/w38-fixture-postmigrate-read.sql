-- W38 disposable fixture ONLY: run as its migrator AFTER the official
-- Prisma migrate deploy. This does not belong to any production migration.
-- Grants the test principal SELECT of migration history, not private data.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_db_owner text;
DECLARE v_migration_owner text;
DECLARE v_marker text;
BEGIN
  SELECT pg_get_userbyid(d.datdba), shobj_description(d.oid,'pg_database')
    INTO v_db_owner, v_marker
  FROM pg_database d WHERE d.datname=current_database();
  SELECT pg_get_userbyid(c.relowner) INTO v_migration_owner
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='_prisma_migrations' AND c.relkind='r';

  IF current_database()<>'issue416_w38_db'
    OR current_user<>'issue416_w38_migrator'
    OR v_db_owner<>'issue416_w38_owner'
    OR v_migration_owner<>'issue416_w38_migrator'
    OR v_marker<>'VAYLET_416_W38_DISPOSABLE_PG17_20261114'
    OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
    OR pg_is_in_recovery()
  THEN
    RAISE EXCEPTION 'W38_POSTMIGRATE_UNTRUSTED_FIXTURE';
  END IF;
  IF (SELECT count(*) FROM public._prisma_migrations) <> 140
    OR EXISTS (
      SELECT 1 FROM public._prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
        OR applied_steps_count < 1
    )
  THEN
    RAISE EXCEPTION 'W38_POSTMIGRATE_HISTORY_INCOMPLETE';
  END IF;
END $$;

GRANT SELECT ON TABLE public._prisma_migrations TO issue416_w38_test;
COMMIT;

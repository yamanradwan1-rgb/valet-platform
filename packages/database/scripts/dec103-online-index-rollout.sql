-- DEC-102 / DEC-103 / #276: operator-run ONLINE index rollout.
-- Run via psql -X -v ON_ERROR_STOP=1 -f ... only after separately verifying
-- the authorized target, snapshot/backup and migration prerequisite 078.
-- DO NOT submit this entire file in one pg client.query(), Prisma migration,
-- transactional batch, or other wrapper that combines the statements.
-- After this finishes, migrate:deploy registers migration 079, which on a
-- nonempty database strictly verifies the preinstalled definitions.
\set ON_ERROR_STOP on
--
-- PostgreSQL must execute CREATE INDEX CONCURRENTLY outside a transaction.
-- The guards below reject an already-present but wrong/INVALID index; the
-- IF NOT EXISTS creates are safe ONLY after the complete definition check.
-- An interrupted concurrent CREATE may leave an INVALID index: STOP and
-- explicitly investigate/recover it instead of silently accepting the name.

DO $index_preflight$
DECLARE
  candidate RECORD;
BEGIN
  FOR candidate IN
    SELECT * FROM (VALUES
      ('audit_events_parked_org_entity_idx',
       'CREATE INDEX audit_events_parked_org_entity_idx ON public.audit_events USING btree (organization_id, entity_id) WHERE (event_type = ''VALET_SESSION_PARKED''::text)'),
      ('audit_events_parked_org_task_ref_idx',
       'CREATE INDEX audit_events_parked_org_task_ref_idx ON public.audit_events USING btree (organization_id, ((metadata_json ->> ''taskId''::text))) WHERE (event_type = ''VALET_SESSION_PARKED''::text)')
    ) AS expected(index_name, definition)
  LOOP
    IF to_regclass('public.' || candidate.index_name) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM pg_catalog.pg_index AS i
          WHERE i.indexrelid = to_regclass('public.' || candidate.index_name)
            AND i.indrelid = 'public.audit_events'::regclass
            AND i.indisvalid AND i.indisready
            AND NOT i.indisunique
            AND pg_catalog.pg_get_indexdef(i.indexrelid) = candidate.definition
       ) THEN
      RAISE EXCEPTION 'DEC-103 conflicting or invalid index: %',
        candidate.index_name;
    END IF;
  END LOOP;
END;
$index_preflight$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_events_parked_org_entity_idx
  ON public.audit_events (organization_id, entity_id)
  WHERE event_type = 'VALET_SESSION_PARKED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS audit_events_parked_org_task_ref_idx
  ON public.audit_events (organization_id, (metadata_json->>'taskId'))
  WHERE event_type = 'VALET_SESSION_PARKED';

DO $index_postflight$
DECLARE
  candidate RECORD;
BEGIN
  FOR candidate IN
    SELECT * FROM (VALUES
      ('audit_events_parked_org_entity_idx',
       'CREATE INDEX audit_events_parked_org_entity_idx ON public.audit_events USING btree (organization_id, entity_id) WHERE (event_type = ''VALET_SESSION_PARKED''::text)'),
      ('audit_events_parked_org_task_ref_idx',
       'CREATE INDEX audit_events_parked_org_task_ref_idx ON public.audit_events USING btree (organization_id, ((metadata_json ->> ''taskId''::text))) WHERE (event_type = ''VALET_SESSION_PARKED''::text)')
    ) AS expected(index_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_index AS i
       WHERE i.indexrelid = to_regclass('public.' || candidate.index_name)
         AND i.indrelid = 'public.audit_events'::regclass
         AND i.indisvalid AND i.indisready
         AND NOT i.indisunique
         AND pg_catalog.pg_get_indexdef(i.indexrelid) = candidate.definition
    ) THEN
      RAISE EXCEPTION 'DEC-103 index missing or inconsistent after rollout: %',
        candidate.index_name;
    END IF;
  END LOOP;
END;
$index_postflight$;

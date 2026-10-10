-- DEC-102 / DEC-103 / #276: safe greenfield + pre-installed upgrade path.
--
-- Fresh empty database: create indexes transactionally while no Audit data
-- exists. Nonempty database: ALWAYS require the separate operator-approved
-- CONCURRENT index rollout, using psql -f, before running migrate:deploy.
-- The Prisma/harness one-query migration path MUST NOT run CREATE INDEX
-- CONCURRENTLY in its implicit transaction.

DO $dec103_assert_indexes$
DECLARE
  candidate RECORD;
  needs_entity BOOLEAN;
  needs_task_ref BOOLEAN;
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
  needs_entity := to_regclass('public.audit_events_parked_org_entity_idx') IS NULL;
  needs_task_ref := to_regclass('public.audit_events_parked_org_task_ref_idx') IS NULL;
  IF needs_entity OR needs_task_ref THEN
    -- The double empty check relies on fresh READ COMMITTED snapshots.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'DEC-103 greenfield index creation requires READ COMMITTED';
    END IF;
    -- Fail before acquiring table locks on any nonempty/live upgrade.
    IF EXISTS (SELECT 1 FROM public.audit_events LIMIT 1) THEN
      RAISE EXCEPTION
        'DEC-103 missing indexes on nonempty Audit table; apply online-index-rollout.sql first';
    END IF;
    -- Defend the empty check against concurrent Audit inserts while creating
    -- ordinary indexes. This lock is safe only on a verified empty bootstrap.
    LOCK TABLE public.audit_events IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM public.audit_events LIMIT 1) THEN
      RAISE EXCEPTION 'DEC-103 Audit table became nonempty; online rollout required';
    END IF;
    IF needs_entity THEN
      EXECUTE 'CREATE INDEX audit_events_parked_org_entity_idx
        ON public.audit_events (organization_id, entity_id)
        WHERE event_type = ''VALET_SESSION_PARKED''';
    END IF;
    IF needs_task_ref THEN
      EXECUTE 'CREATE INDEX audit_events_parked_org_task_ref_idx
        ON public.audit_events (organization_id, (metadata_json->>''taskId''))
        WHERE event_type = ''VALET_SESSION_PARKED''';
    END IF;
  END IF;
  -- Regardless of preinstalled vs greenfield creation, assert exact catalog
  -- shape before Prisma can record the migration as successfully applied.
  FOR candidate IN
    SELECT * FROM (VALUES
      ('audit_events_parked_org_entity_idx',
       'CREATE INDEX audit_events_parked_org_entity_idx ON public.audit_events USING btree (organization_id, entity_id) WHERE (event_type = ''VALET_SESSION_PARKED''::text)'),
      ('audit_events_parked_org_task_ref_idx',
       'CREATE INDEX audit_events_parked_org_task_ref_idx ON public.audit_events USING btree (organization_id, ((metadata_json ->> ''taskId''::text))) WHERE (event_type = ''VALET_SESSION_PARKED''::text)')
    ) AS expected(index_name, definition)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_index AS i
       WHERE i.indexrelid = to_regclass('public.' || candidate.index_name)
         AND i.indrelid = 'public.audit_events'::regclass
         AND i.indisvalid AND i.indisready AND NOT i.indisunique
         AND pg_catalog.pg_get_indexdef(i.indexrelid) = candidate.definition
    ) THEN
      RAISE EXCEPTION 'DEC-103 index failed postflight: %', candidate.index_name;
    END IF;
  END LOOP;
END;
$dec103_assert_indexes$;

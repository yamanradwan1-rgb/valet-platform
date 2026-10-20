-- Issue #300 Option B, Owner-approved local forward-only provenance barrier.
-- Historical NULL markers are deliberately never rewritten/backfilled.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Settle pre-activation writers before publishing Task birth and the immutable
-- parent/association constraints. No partially active epoch is observable.
LOCK TABLE public.audit_events, public.tasks, public.incidents,
  public.valet_sessions IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.tasks ADD COLUMN pagination_birth_xid xid8;
ALTER TABLE public.tasks
  ALTER COLUMN pagination_birth_xid SET DEFAULT pg_current_xact_id();
CREATE TRIGGER tasks_pagination_birth_insert
  BEFORE INSERT ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();
CREATE TRIGGER tasks_pagination_birth_update
  BEFORE UPDATE OF pagination_birth_xid ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION public.management_pagination_preserve_birth_xid();

-- The operational Task projection is mutable (status, assignee, version),
-- but its canonical entity-to-Session relation is not historical state.
-- Database enforcement is necessary: runtime can issue arbitrary Task UPDATE.
CREATE FUNCTION public.issue300_prevent_relation_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'tasks' THEN
    IF (OLD.id, OLD.organization_id, OLD.location_id,
        OLD.valet_session_id, OLD.task_type)
       IS DISTINCT FROM
       (NEW.id, NEW.organization_id, NEW.location_id,
        NEW.valet_session_id, NEW.task_type) THEN
      RAISE EXCEPTION 'ISSUE300_TASK_RELATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'incidents' THEN
    IF (OLD.id, OLD.organization_id, OLD.location_id, OLD.valet_session_id,
        OLD.created_at, OLD.reported_by_membership_id, OLD.type, OLD.severity)
       IS DISTINCT FROM
       (NEW.id, NEW.organization_id, NEW.location_id, NEW.valet_session_id,
        NEW.created_at, NEW.reported_by_membership_id, NEW.type, NEW.severity) THEN
      RAISE EXCEPTION 'ISSUE300_INCIDENT_RELATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'valet_sessions' THEN
    IF (OLD.id, OLD.organization_id, OLD.location_id, OLD.vehicle_id)
       IS DISTINCT FROM
       (NEW.id, NEW.organization_id, NEW.location_id, NEW.vehicle_id) THEN
      RAISE EXCEPTION 'ISSUE300_SESSION_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'audit_events' THEN
    IF (OLD.id, OLD.organization_id, OLD.location_id,
        OLD.valet_session_id, OLD.actor_membership_id, OLD.actor_type,
        OLD.event_type, OLD.entity_type, OLD.entity_id, OLD.metadata_json,
        OLD.occurred_at, OLD.created_at)
       IS DISTINCT FROM
       (NEW.id, NEW.organization_id, NEW.location_id,
        NEW.valet_session_id, NEW.actor_membership_id, NEW.actor_type,
        NEW.event_type, NEW.entity_type, NEW.entity_id, NEW.metadata_json,
        NEW.occurred_at, NEW.created_at) THEN
      RAISE EXCEPTION 'ISSUE300_AUDIT_RELATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tasks_issue300_relation_immutable
  BEFORE UPDATE ON public.tasks FOR EACH ROW
  EXECUTE FUNCTION public.issue300_prevent_relation_rewrite();
CREATE TRIGGER incidents_issue300_relation_immutable
  BEFORE UPDATE ON public.incidents FOR EACH ROW
  EXECUTE FUNCTION public.issue300_prevent_relation_rewrite();
CREATE TRIGGER valet_sessions_issue300_relation_immutable
  BEFORE UPDATE ON public.valet_sessions FOR EACH ROW
  EXECUTE FUNCTION public.issue300_prevent_relation_rewrite();
CREATE TRIGGER audit_events_issue300_relation_immutable
  BEFORE UPDATE ON public.audit_events FOR EACH ROW
  EXECUTE FUNCTION public.issue300_prevent_relation_rewrite();

REVOKE ALL ON FUNCTION public.issue300_prevent_relation_rewrite() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.management_pagination_preserve_birth_xid() FROM PUBLIC;
COMMIT;

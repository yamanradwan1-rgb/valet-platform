-- Issue #352: append-only idempotency receipt, attributed movement segments,
-- and a distinct emergency DispatchEvent without changing normal Reassign.
BEGIN;

ALTER TABLE public.dispatch_events
  DROP CONSTRAINT dispatch_events_assignee_shape_check;
ALTER TABLE public.dispatch_events
  ADD CONSTRAINT dispatch_events_assignee_shape_check CHECK (
    (event_type = 'QUEUED' AND previous_assignee_membership_id IS NULL
      AND new_assignee_membership_id IS NULL)
    OR (event_type IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
      AND new_assignee_membership_id IS NOT NULL)
    OR (event_type = 'DECLINED' AND previous_assignee_membership_id IS NOT NULL)
    OR (event_type = 'REASSIGNED'
      AND previous_assignee_membership_id IS NOT NULL
      AND new_assignee_membership_id IS NOT NULL
      AND previous_assignee_membership_id <> new_assignee_membership_id)
    OR (event_type = 'EMERGENCY_TAKEOVER'
      AND actor_membership_id IS NOT NULL
      AND previous_assignee_membership_id IS NOT NULL
      AND new_assignee_membership_id IS NOT NULL
      AND previous_assignee_membership_id <> new_assignee_membership_id
      AND reason IS NOT NULL
      AND char_length(btrim(reason)) BETWEEN 1 AND 500)
    OR event_type = 'CANCELLED'
  );

-- Historical segments have no provable immutable owner. Do not backfill them
-- from the mutable current Task assignee, including a previously ended route.
ALTER TABLE public.task_tracking_sessions
  ADD COLUMN assignee_membership_id UUID;
ALTER TABLE public.task_tracking_sessions
  ADD CONSTRAINT task_tracking_sessions_org_assignee_membership_fkey
  FOREIGN KEY (organization_id, assignee_membership_id)
  REFERENCES public.organization_memberships(organization_id, id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX task_tracking_sessions_assignee_started_idx
  ON public.task_tracking_sessions(assignee_membership_id, started_at, id);

CREATE FUNCTION public.issue352_guard_tracking_owner() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.assignee_membership_id IS DISTINCT FROM OLD.assignee_membership_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='A tracking segment owner cannot be rewritten.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue352_tracking_owner_immutable
  BEFORE UPDATE ON public.task_tracking_sessions
  FOR EACH ROW EXECUTE FUNCTION public.issue352_guard_tracking_owner();
REVOKE ALL ON FUNCTION public.issue352_guard_tracking_owner() FROM PUBLIC;

-- Scoped composite indexes allow receipts to reference events without
-- permitting an event or actor from a different Organization.
CREATE UNIQUE INDEX dispatch_events_organization_id_id_unique
  ON public.dispatch_events(organization_id,id);
CREATE UNIQUE INDEX audit_events_organization_id_id_unique
  ON public.audit_events(organization_id,id);

CREATE TABLE public.emergency_task_takeover_operations (
  organization_id UUID NOT NULL,
  operation_id UUID NOT NULL,
  location_id UUID NOT NULL,
  valet_session_id UUID NOT NULL,
  task_id UUID NOT NULL,
  actor_membership_id UUID NOT NULL,
  previous_assignee_membership_id UUID NOT NULL,
  new_assignee_membership_id UUID NOT NULL,
  expected_task_version INTEGER NOT NULL,
  result_task_version INTEGER NOT NULL,
  expected_session_version INTEGER NOT NULL,
  result_session_version INTEGER NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ(3) NOT NULL,
  dispatch_event_id UUID NOT NULL,
  audit_event_id UUID NOT NULL,
  ended_old_tracking_session_id UUID,
  new_tracking_session_id UUID,
  CONSTRAINT emergency_task_takeover_operations_pkey
    PRIMARY KEY (organization_id, operation_id),
  CONSTRAINT emergency_takeover_location_fk FOREIGN KEY (organization_id,location_id)
    REFERENCES public.locations(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_task_fk FOREIGN KEY
    (organization_id,location_id,valet_session_id,task_id)
    REFERENCES public.tasks(organization_id,location_id,valet_session_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_actor_fk FOREIGN KEY
    (organization_id,actor_membership_id)
    REFERENCES public.organization_memberships(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_previous_fk FOREIGN KEY
    (organization_id,previous_assignee_membership_id)
    REFERENCES public.organization_memberships(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_new_fk FOREIGN KEY
    (organization_id,new_assignee_membership_id)
    REFERENCES public.organization_memberships(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_dispatch_fk FOREIGN KEY
    (organization_id,dispatch_event_id)
    REFERENCES public.dispatch_events(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_audit_fk FOREIGN KEY
    (organization_id,audit_event_id)
    REFERENCES public.audit_events(organization_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_old_tracker_fk FOREIGN KEY
    (organization_id,location_id,valet_session_id,task_id,ended_old_tracking_session_id)
    REFERENCES public.task_tracking_sessions
    (organization_id,location_id,valet_session_id,task_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_new_tracker_fk FOREIGN KEY
    (organization_id,location_id,valet_session_id,task_id,new_tracking_session_id)
    REFERENCES public.task_tracking_sessions
    (organization_id,location_id,valet_session_id,task_id,id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT emergency_takeover_task_versions_check
    CHECK (expected_task_version > 0 AND result_task_version = expected_task_version + 1),
  CONSTRAINT emergency_takeover_session_versions_check
    CHECK (expected_session_version > 0 AND result_session_version = expected_session_version + 1),
  CONSTRAINT emergency_takeover_memberships_distinct_check
    CHECK (previous_assignee_membership_id <> new_assignee_membership_id),
  CONSTRAINT emergency_takeover_request_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT emergency_takeover_dispatch_once UNIQUE (dispatch_event_id),
  CONSTRAINT emergency_takeover_audit_once UNIQUE (audit_event_id)
);
CREATE INDEX emergency_takeover_task_occurred_idx
  ON public.emergency_task_takeover_operations(task_id,occurred_at DESC,operation_id);
CREATE UNIQUE INDEX emergency_takeover_org_dispatch_event_unique
  ON public.emergency_task_takeover_operations(organization_id,dispatch_event_id);
CREATE UNIQUE INDEX emergency_takeover_org_audit_event_unique
  ON public.emergency_task_takeover_operations(organization_id,audit_event_id);

CREATE FUNCTION public.issue352_guard_takeover_receipt() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23514',
    MESSAGE='An emergency takeover receipt is immutable.';
END;
$$;
CREATE TRIGGER issue352_takeover_receipt_immutable
  BEFORE UPDATE OR DELETE ON public.emergency_task_takeover_operations
  FOR EACH ROW EXECUTE FUNCTION public.issue352_guard_takeover_receipt();

REVOKE ALL ON TABLE public.emergency_task_takeover_operations FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue352_guard_takeover_receipt() FROM PUBLIC;
COMMIT;

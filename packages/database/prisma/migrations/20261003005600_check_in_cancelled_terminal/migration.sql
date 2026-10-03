-- DEC-097: retained terminal intake, never physical release.
DROP INDEX public.valet_sessions_active_location_vehicle_key;
CREATE UNIQUE INDEX valet_sessions_active_location_vehicle_key
ON public.valet_sessions(location_id, vehicle_id)
WHERE state NOT IN ('COMPLETED', 'CANCELLED');

DROP INDEX public.valet_sessions_location_id_non_completed_idx;
CREATE INDEX valet_sessions_location_id_non_completed_idx
ON public.valet_sessions(location_id)
WHERE state NOT IN ('COMPLETED', 'CANCELLED');

ALTER TABLE public.valet_sessions
ADD CONSTRAINT valet_sessions_cancelled_intake_only_check CHECK (
  state <> 'CANCELLED' OR (
    checking_in_completed_at IS NULL AND parking_started_at IS NULL
    AND parked_at IS NULL AND retrieval_requested_at IS NULL
    AND retrieval_started_at IS NULL AND ready_at IS NULL
    AND handoff_pending_at IS NULL AND completed_at IS NULL
    AND completed_by_membership_id IS NULL
    AND current_assignee_membership_id IS NULL
    AND key_slot_id IS NULL AND parking_zone_id IS NULL AND parking_spot_id IS NULL
  )
);

CREATE OR REPLACE FUNCTION public.management_location_has_blockers(
  p_organization_id UUID, p_location_id UUID
) RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT EXISTS(SELECT 1 FROM public.valet_sessions
    WHERE organization_id=p_organization_id AND location_id=p_location_id
      AND state NOT IN ('COMPLETED','CANCELLED'))
    OR EXISTS(SELECT 1 FROM public.shifts
      WHERE organization_id=p_organization_id AND location_id=p_location_id AND status='ACTIVE')
    OR EXISTS(SELECT 1 FROM public.tasks
      WHERE organization_id=p_organization_id AND location_id=p_location_id
        AND status IN ('QUEUED','ASSIGNED','ACCEPTED','IN_PROGRESS'))
$$;

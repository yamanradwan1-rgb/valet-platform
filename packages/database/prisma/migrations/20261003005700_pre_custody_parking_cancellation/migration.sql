-- DEC-098: preserve true completed intake; never manufacture custody release.
ALTER TABLE public.valet_sessions
DROP CONSTRAINT valet_sessions_cancelled_intake_only_check;

ALTER TABLE public.valet_sessions
ADD CONSTRAINT valet_sessions_cancelled_pre_custody_check CHECK (
  state <> 'CANCELLED' OR (
    -- Both incomplete intake (DEC-097) and completed intake (DEC-098) are legal.
    -- checking_in_completed_at is retained in either shape; neither allows custody.
    parking_started_at IS NULL AND parked_at IS NULL
    AND retrieval_requested_at IS NULL AND retrieval_started_at IS NULL
    AND ready_at IS NULL AND handoff_pending_at IS NULL AND completed_at IS NULL
    AND completed_by_membership_id IS NULL
    AND current_assignee_membership_id IS NULL
    AND key_slot_id IS NULL AND parking_zone_id IS NULL AND parking_spot_id IS NULL
  )
);

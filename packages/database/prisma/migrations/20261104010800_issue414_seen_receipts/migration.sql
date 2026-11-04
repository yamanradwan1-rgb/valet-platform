-- DEC-110 OD-07C: only explicitly Seen, committed and source-typed occurrences.
-- No retention deletion: seven days controls insertion eligibility, not history.
-- Geofence events have a global UUID PK but no (org,id) key; add the narrow
-- redundant unique key so tenant scope is enforced by the receipt foreign key.
CREATE UNIQUE INDEX geofence_events_org_id_seen_fkey
  ON public.geofence_events (organization_id, id);

CREATE TABLE public.management_alert_seen_receipts (
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category varchar(6) NOT NULL,
  source_id uuid NOT NULL,
  takeover_operation_id uuid,
  occurrence_audit_event_id uuid,
  geofence_event_id uuid,
  seen_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT management_alert_seen_receipts_pkey
    PRIMARY KEY (organization_id, user_id, category, source_id),
  CONSTRAINT management_alert_seen_membership_fk
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_memberships (organization_id, user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT management_alert_seen_takeover_fk
    FOREIGN KEY (organization_id, takeover_operation_id)
    REFERENCES public.emergency_task_takeover_operations (organization_id, operation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT management_alert_seen_audit_occurrence_fk
    FOREIGN KEY (organization_id, occurrence_audit_event_id)
    REFERENCES public.audit_events (organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT management_alert_seen_geofence_occurrence_fk
    FOREIGN KEY (organization_id, geofence_event_id)
    REFERENCES public.geofence_events (organization_id, id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT management_alert_seen_category_source_check CHECK (
    (category = 'ALT-05' AND takeover_operation_id IS NOT NULL
      AND takeover_operation_id = source_id
      AND occurrence_audit_event_id IS NULL AND geofence_event_id IS NULL)
    OR
    (category IN ('ALT-07','ALT-13','ALT-15') AND occurrence_audit_event_id IS NOT NULL
      AND occurrence_audit_event_id = source_id
      AND takeover_operation_id IS NULL AND geofence_event_id IS NULL)
    OR
    (category = 'ALT-09' AND geofence_event_id IS NOT NULL
      AND geofence_event_id = source_id
      AND takeover_operation_id IS NULL AND occurrence_audit_event_id IS NULL)
  )
);

CREATE INDEX management_alert_seen_takeover_idx
  ON public.management_alert_seen_receipts (organization_id, takeover_operation_id);
CREATE INDEX management_alert_seen_audit_occurrence_idx
  ON public.management_alert_seen_receipts (organization_id, occurrence_audit_event_id);
CREATE INDEX management_alert_seen_geofence_occurrence_idx
  ON public.management_alert_seen_receipts (organization_id, geofence_event_id);

REVOKE ALL ON TABLE public.management_alert_seen_receipts FROM PUBLIC;

-- Measured BE-11 company report index retained by the representative
-- PostgreSQL 17.11 benchmark.
CREATE INDEX dispatch_events_org_location_occurred_at_company_reports_idx
ON public.dispatch_events (organization_id, location_id, occurred_at)
INCLUDE (task_id, event_type);

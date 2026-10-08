-- Selected after EXPLAIN/BUFFERS evidence on 100,000 protected disposable rows.
-- No wall-clock predicate: current-window filtering remains in the query.
CREATE INDEX anti_abuse_events_guest_group_window_idx
ON public.anti_abuse_events(scope,group_key_hash,occurred_at)
WHERE group_key_hash IS NOT NULL AND state IN ('PENDING','COUNTED');

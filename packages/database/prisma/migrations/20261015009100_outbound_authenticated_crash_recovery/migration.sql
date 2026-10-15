-- W7 F11: callback-first acceptance must survive process death. Forward-only;
-- retain 086-090 checksums and the non-replayable UNKNOWN fallback.
CREATE OR REPLACE FUNCTION outbound_cleanup_stale(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; v_count integer:=0; v_now timestamptz; v_authenticated boolean;
BEGIN
  IF p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION 'OUTBOUND_CLEANUP_LIMIT' USING ERRCODE='22023';
  END IF;
  FOR r IN
    SELECT d.id,d.organization_id,d.intent_id,d.state,i.expires_at
    FROM outbound_message_deliveries d
    JOIN outbound_message_intents i ON i.id=d.intent_id AND i.organization_id=d.organization_id
    WHERE (i.expires_at<=clock_timestamp()
      AND d.state IN ('PENDING','LEASED','DISPATCHING','RETRY_WAIT'))
      OR (d.state='DISPATCHING' AND d.lease_expires_at<=clock_timestamp())
    ORDER BY i.expires_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT p_limit
  LOOP
    v_now:=clock_timestamp();
    v_authenticated:=false;
    -- The webhook function serializes on this same delivery lock and persists
    -- an immutable correlated event before returning. Timestamps and a bare
    -- provider_message_id are not accepted as proof by themselves.
    IF r.state='DISPATCHING' THEN
      SELECT EXISTS(
        SELECT 1 FROM outbound_message_events e
        JOIN outbound_message_attempts a ON a.id=e.attempt_id
          AND a.delivery_id=e.delivery_id AND a.organization_id=e.organization_id
          AND a.provider_binding_id=e.provider_binding_id
        WHERE e.delivery_id=r.id AND e.organization_id=r.organization_id
          AND e.event_kind IN ('SENT','DELIVERED','READ')
      ) INTO v_authenticated;
    END IF;

    UPDATE outbound_message_deliveries SET
      state=CASE WHEN v_authenticated THEN 'ACCEPTED'
        WHEN r.state='DISPATCHING' THEN 'UNKNOWN' ELSE 'EXPIRED' END,
      accepted_at=CASE WHEN v_authenticated THEN COALESCE(accepted_at,v_now)
        ELSE accepted_at END,
      terminal_reason=CASE WHEN v_authenticated THEN NULL
        WHEN r.state='DISPATCHING' THEN 'UNKNOWN' ELSE 'EXPIRED' END,
      lease_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=v_now
      WHERE id=r.id;
    IF r.state='DISPATCHING' THEN
      UPDATE outbound_message_attempts a SET state=CASE
        WHEN v_authenticated AND EXISTS(
          SELECT 1 FROM outbound_message_events e
          WHERE e.organization_id=a.organization_id AND e.delivery_id=a.delivery_id
            AND e.attempt_id=a.id AND e.provider_binding_id=a.provider_binding_id
            AND e.event_kind IN ('SENT','DELIVERED','READ')
        ) THEN 'ACCEPTED' ELSE 'UNKNOWN' END
      WHERE a.delivery_id=r.id AND a.organization_id=r.organization_id
        AND a.state='DISPATCHING';
    END IF;
    DELETE FROM outbound_message_envelopes WHERE intent_id=r.intent_id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION outbound_cleanup_stale(integer) FROM PUBLIC;

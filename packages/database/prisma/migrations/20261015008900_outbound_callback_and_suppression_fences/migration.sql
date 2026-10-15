-- Forward-only Stage C hotfix after 088. Preserve previously applied migration checksums.
-- Evidence from a signed callback owns provider acceptance, even before HTTP completion.
CREATE OR REPLACE FUNCTION outbound_finish_attempt(p_delivery uuid,p_lease uuid,p_attempt uuid,
  p_outcome text,p_message_id text,p_safe_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_d outbound_message_deliveries%ROWTYPE; v_a outbound_message_attempts%ROWTYPE;
  v_next text; v_now timestamptz:=clock_timestamp(); v_delay integer; v_deadline timestamptz;
BEGIN
  IF p_outcome NOT IN ('ACCEPTED','UNKNOWN','NOT_SENT','DEFINITIVE_FAILURE','PERMANENT_FAILURE')
    OR (p_outcome='ACCEPTED' AND (p_message_id IS NULL OR length(p_message_id)>255))
  THEN RAISE EXCEPTION 'OUTBOUND_RESULT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT d.* INTO v_d FROM outbound_message_deliveries d WHERE d.id=p_delivery FOR UPDATE;
  SELECT a.* INTO v_a FROM outbound_message_attempts a
    WHERE a.id=p_attempt AND a.delivery_id=p_delivery AND a.organization_id=v_d.organization_id FOR UPDATE;
  IF v_a.id IS NULL OR v_d.lease_token IS DISTINCT FROM p_lease OR v_d.state<>'DISPATCHING'
    OR v_a.state<>'DISPATCHING' THEN RETURN false; END IF;

  -- Callback-first evidence and provider acceptance are monotone. A stale HTTP result
  -- can never cause retry of an already accepted/correlated send.
  IF v_a.provider_message_id IS NOT NULL OR EXISTS(
    SELECT 1 FROM outbound_message_events e
      WHERE e.attempt_id=v_a.id AND e.organization_id=v_a.organization_id
        AND e.event_kind IN ('SENT','DELIVERED','READ')
  ) THEN
    UPDATE outbound_message_attempts
      SET state='ACCEPTED',
        provider_message_id=COALESCE(v_a.provider_message_id,p_message_id),
        safe_code=NULL WHERE id=v_a.id;
    UPDATE outbound_message_deliveries SET state='ACCEPTED',accepted_at=COALESCE(accepted_at,v_now),
      next_attempt_at=NULL,lease_token=NULL,lease_expires_at=NULL,terminal_reason=NULL,
      updated_at=v_now WHERE id=p_delivery;
    DELETE FROM outbound_message_envelopes WHERE intent_id=v_d.intent_id;
    RETURN true;
  END IF;

  SELECT i.expires_at INTO v_deadline FROM outbound_message_intents i WHERE i.id=v_d.intent_id;
  v_delay:=LEAST(300,(30 * (2 ^ GREATEST(v_d.attempt_count-1,0)))::integer
    + floor(random()*11)::integer);
  v_next:=CASE WHEN p_outcome IN ('NOT_SENT','DEFINITIVE_FAILURE')
    AND v_d.attempt_count<v_d.max_attempts
    AND v_now + make_interval(secs=>v_delay) < v_deadline-interval '10 seconds'
    THEN 'RETRY_WAIT' WHEN p_outcome IN ('NOT_SENT','DEFINITIVE_FAILURE')
    THEN 'PERMANENT_FAILURE' ELSE p_outcome END;
  UPDATE outbound_message_attempts SET state=p_outcome,provider_message_id=p_message_id,
    safe_code=p_safe_code WHERE id=p_attempt;
  UPDATE outbound_message_deliveries SET state=v_next,lease_token=NULL,lease_expires_at=NULL,
    next_attempt_at=CASE WHEN v_next='RETRY_WAIT'
      THEN v_now + make_interval(secs=>v_delay) ELSE NULL END,
    accepted_at=CASE WHEN p_outcome='ACCEPTED' THEN v_now ELSE accepted_at END,
    terminal_reason=CASE WHEN v_next='UNKNOWN' THEN 'UNKNOWN'
      WHEN v_next='PERMANENT_FAILURE' THEN 'PERMANENT' ELSE terminal_reason END,
    updated_at=v_now WHERE id=p_delivery;
  IF v_next<>'RETRY_WAIT' THEN DELETE FROM outbound_message_envelopes WHERE intent_id=v_d.intent_id; END IF;
  RETURN true;
END $$;

-- A delayed authenticated callback must cancel any waiting retry of this delivery.
CREATE OR REPLACE FUNCTION outbound_record_provider_event(p_binding uuid,p_handle uuid,p_message_id text,
  p_recipient_digest text,p_kind text,p_provider_time timestamptz,p_dedupe text,p_safe_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_a outbound_message_attempts%ROWTYPE; v_d outbound_message_deliveries%ROWTYPE;
  v_i outbound_message_intents%ROWTYPE; v_time timestamptz; v_now timestamptz;
BEGIN
  IF p_kind NOT IN ('SENT','DELIVERED','READ','FAILED') OR p_dedupe !~ '^[a-f0-9]{64}$'
    OR (p_handle IS NULL AND p_message_id IS NULL)
  THEN RAISE EXCEPTION 'OUTBOUND_EVENT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT a.* INTO v_a FROM outbound_message_attempts a
    WHERE a.provider_binding_id=p_binding
      AND ((p_handle IS NOT NULL AND a.callback_handle=p_handle)
      OR (p_message_id IS NOT NULL AND a.provider_message_id=p_message_id));
  IF NOT FOUND OR (p_handle IS NOT NULL AND p_handle<>v_a.callback_handle)
    OR (p_message_id IS NOT NULL AND v_a.provider_message_id IS NOT NULL
      AND p_message_id<>v_a.provider_message_id)
  THEN RETURN false; END IF;
  SELECT d.* INTO v_d FROM outbound_message_deliveries d WHERE d.id=v_a.delivery_id FOR UPDATE;
  SELECT a.* INTO v_a FROM outbound_message_attempts a WHERE a.id=v_a.id FOR UPDATE;
  SELECT i.* INTO v_i FROM outbound_message_intents i WHERE i.id=v_d.intent_id;
  IF v_i.recipient_digest<>p_recipient_digest THEN RETURN false; END IF;
  IF p_message_id IS NOT NULL AND v_a.provider_message_id IS NULL
  THEN UPDATE outbound_message_attempts SET provider_message_id=p_message_id WHERE id=v_a.id; END IF;
  INSERT INTO outbound_message_events(organization_id,delivery_id,attempt_id,provider_binding_id,
    dedupe_digest,event_kind,provider_occurred_at,safe_code)
  VALUES(v_a.organization_id,v_a.delivery_id,v_a.id,p_binding,p_dedupe,p_kind,p_provider_time,p_safe_code)
    ON CONFLICT(provider_binding_id,dedupe_digest) DO NOTHING;
  IF NOT FOUND THEN RETURN true; END IF;
  v_time:=COALESCE(p_provider_time,clock_timestamp());
  v_now:=clock_timestamp();
  UPDATE outbound_message_deliveries SET
    sent_at=CASE WHEN p_kind='SENT' THEN COALESCE(sent_at,v_time) ELSE sent_at END,
    delivered_at=CASE WHEN p_kind='DELIVERED' THEN COALESCE(delivered_at,v_time) ELSE delivered_at END,
    read_at=CASE WHEN p_kind='READ' THEN COALESCE(read_at,v_time) ELSE read_at END,
    failed_at=CASE WHEN p_kind='FAILED' THEN COALESCE(failed_at,v_time) ELSE failed_at END,
    state=CASE WHEN p_kind IN ('SENT','DELIVERED','READ')
      AND v_d.state IN ('PENDING','RETRY_WAIT','LEASED') THEN 'ACCEPTED'
      WHEN p_kind IN ('SENT','DELIVERED','READ') AND v_d.state='DISPATCHING'
        AND v_a.state<>'DISPATCHING' THEN 'UNKNOWN'
      ELSE state END,
    accepted_at=CASE WHEN p_kind IN ('SENT','DELIVERED','READ')
      AND v_d.state IN ('PENDING','RETRY_WAIT','LEASED') THEN COALESCE(accepted_at,v_now)
      ELSE accepted_at END,
    terminal_reason=CASE WHEN p_kind IN ('SENT','DELIVERED','READ')
      AND v_d.state='DISPATCHING' AND v_a.state<>'DISPATCHING' THEN 'UNKNOWN'
      ELSE terminal_reason END,
    lease_token=CASE WHEN p_kind IN ('SENT','DELIVERED','READ')
      AND (v_d.state IN ('PENDING','RETRY_WAIT','LEASED')
        OR (v_d.state='DISPATCHING' AND v_a.state<>'DISPATCHING'))
      THEN NULL ELSE lease_token END,
    lease_expires_at=CASE WHEN p_kind IN ('SENT','DELIVERED','READ')
      AND (v_d.state IN ('PENDING','RETRY_WAIT','LEASED')
        OR (v_d.state='DISPATCHING' AND v_a.state<>'DISPATCHING'))
      THEN NULL ELSE lease_expires_at END,
    next_attempt_at=CASE WHEN p_kind IN ('SENT','DELIVERED','READ')
      THEN NULL ELSE next_attempt_at END,
    updated_at=v_now WHERE id=v_d.id;
  IF p_kind IN ('SENT','DELIVERED','READ') AND
    (v_d.state IN ('PENDING','RETRY_WAIT','LEASED')
      OR (v_d.state='DISPATCHING' AND v_a.state<>'DISPATCHING'))
  THEN DELETE FROM outbound_message_envelopes WHERE intent_id=v_d.intent_id; END IF;
  RETURN true;
END $$;

-- Bound retries using provider Retry-After if W4 supplies it; old 6-arg callers
-- remain supported and use bounded exponential backoff with jitter.
CREATE FUNCTION outbound_finish_attempt(p_delivery uuid,p_lease uuid,p_attempt uuid,
  p_outcome text,p_message_id text,p_safe_code text,p_retry_after_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_result boolean; v_now timestamptz:=clock_timestamp();
  v_deadline timestamptz;
BEGIN
  IF p_retry_after_seconds IS NOT NULL
    AND (p_retry_after_seconds<0 OR p_retry_after_seconds>1800)
  THEN RAISE EXCEPTION 'OUTBOUND_RETRY_AFTER_INVALID' USING ERRCODE='22023'; END IF;
  v_result:=outbound_finish_attempt(p_delivery,p_lease,p_attempt,p_outcome,p_message_id,p_safe_code);
  IF v_result AND p_retry_after_seconds IS NOT NULL THEN
    SELECT i.expires_at INTO v_deadline FROM outbound_message_deliveries d
      JOIN outbound_message_intents i ON i.id=d.intent_id WHERE d.id=p_delivery;
    IF v_now+make_interval(secs=>p_retry_after_seconds)>=v_deadline-interval '10 seconds' THEN
      UPDATE outbound_message_deliveries SET state='PERMANENT_FAILURE',
        next_attempt_at=NULL,terminal_reason='ATTEMPTS',updated_at=clock_timestamp()
        WHERE id=p_delivery AND state='RETRY_WAIT';
      IF FOUND THEN
        DELETE FROM outbound_message_envelopes e
          USING outbound_message_deliveries d WHERE d.id=p_delivery AND e.intent_id=d.intent_id;
      END IF;
    ELSE
      UPDATE outbound_message_deliveries d SET next_attempt_at=GREATEST(
        d.next_attempt_at,v_now+make_interval(secs=>p_retry_after_seconds))
        WHERE d.id=p_delivery AND d.state='RETRY_WAIT';
    END IF;
  END IF;
  RETURN v_result;
END $$;

-- Suppress as soon as revocation, opt-out, completion, cancellation or
-- one-time credential consumption makes an undispatched intent ineligible.
CREATE FUNCTION outbound_suppress_ineligible(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; v_count integer:=0;
BEGIN
  IF p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION 'OUTBOUND_SUPPRESS_LIMIT' USING ERRCODE='22023';
  END IF;
  FOR r IN SELECT d.id,d.intent_id
    FROM outbound_message_deliveries d
    JOIN outbound_message_intents i ON i.id=d.intent_id AND i.organization_id=d.organization_id
    JOIN valet_sessions s ON s.id=i.valet_session_id AND s.organization_id=i.organization_id
      AND s.location_id=i.location_id
    LEFT JOIN outbound_messaging_permissions p
      ON p.id=i.permission_id AND p.organization_id=i.organization_id
    WHERE d.state IN ('PENDING','RETRY_WAIT','LEASED')
      AND (s.customer_id IS DISTINCT FROM i.customer_id
        OR s.state IN ('COMPLETED','CANCELLED')
        OR s.customer_access_generation<>i.credential_generation
        OR s.customer_access_revoked_at IS NOT NULL
        OR s.customer_access_consumed_at IS NOT NULL
        OR s.customer_access_expires_at<=clock_timestamp()
        OR p.id IS NULL OR p.recipient_digest<>i.recipient_digest
        OR p.revision<>i.permission_revision OR p.withdrawn_at IS NOT NULL
        OR p.collected_at>clock_timestamp()
        OR (p.expires_at IS NOT NULL AND p.expires_at<=clock_timestamp()))
    ORDER BY d.created_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT p_limit
  LOOP
    UPDATE outbound_message_deliveries SET state='SUPPRESSED',
      terminal_reason='REVOKED',next_attempt_at=NULL,
      lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
      WHERE id=r.id;
    DELETE FROM outbound_message_envelopes WHERE intent_id=r.intent_id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION outbound_recover_expired(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_total integer;
BEGIN
  IF p_limit<1 OR p_limit>100 THEN
    RAISE EXCEPTION 'OUTBOUND_RECOVERY_LIMIT' USING ERRCODE='22023';
  END IF;
  v_total:=outbound_cleanup_stale(p_limit);
  IF v_total<p_limit THEN
    v_total:=v_total+outbound_suppress_ineligible(p_limit-v_total);
  END IF;
  RETURN v_total;
END $$;

-- API may acquire only the just-scoped Customer row lock via this function.
-- No direct Customer UPDATE or SELECT FOR SHARE privilege is granted.
CREATE FUNCTION outbound_read_intake_customer(p_org uuid,p_session uuid,p_customer uuid)
RETURNS TABLE(phone_normalized text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT c.phone_normalized FROM valet_sessions s
    JOIN customers c ON c.organization_id=s.organization_id AND c.id=s.customer_id
    WHERE s.id=p_session AND s.organization_id=p_org AND s.customer_id=p_customer
      AND s.state NOT IN ('COMPLETED','CANCELLED')
    FOR SHARE OF c
$$;

-- Issuer's consent snapshot requires a scoped row lock, paired with the
-- immutable event at precisely the observed permission revision.
CREATE FUNCTION outbound_read_intake_permission(p_org uuid,p_digest text)
RETURNS TABLE(id uuid,revision integer,evidence_reference text,collected_at timestamptz,
  expires_at timestamptz,withdrawn_at timestamptz,action text,latest_evidence_reference text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT p.id,p.revision,p.evidence_reference,p.collected_at,p.expires_at,
    p.withdrawn_at,e.action,e.evidence_reference
  FROM outbound_messaging_permissions p
  JOIN outbound_permission_events e
    ON e.organization_id=p.organization_id AND e.permission_id=p.id
      AND e.revision=p.revision
  WHERE p.organization_id=p_org AND p.recipient_digest=p_digest
    AND p.purpose='INITIAL_GUEST_ACCESS'
  FOR SHARE OF p
$$;

-- Global issue OFF/ON is operator-owned. API only obtains a locked snapshot.
CREATE FUNCTION outbound_read_intake_issue_control(p_environment text)
RETURNS TABLE(issue_enabled boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT c.issue_enabled FROM outbound_messaging_control c
    WHERE c.environment=p_environment
      AND p_environment IN ('test','production')
    FOR SHARE OF c
$$;

REVOKE ALL ON FUNCTION
  outbound_finish_attempt(uuid,uuid,uuid,text,text,text),
  outbound_finish_attempt(uuid,uuid,uuid,text,text,text,integer),
  outbound_record_provider_event(uuid,uuid,text,text,text,timestamptz,text,text),
  outbound_suppress_ineligible(integer),
  outbound_recover_expired(integer),
  outbound_read_intake_customer(uuid,uuid,uuid),
  outbound_read_intake_permission(uuid,text),
  outbound_read_intake_issue_control(text)
  FROM PUBLIC;

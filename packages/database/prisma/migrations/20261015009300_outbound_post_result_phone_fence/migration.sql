-- W7 F33 follow-up: distinguish a known NOT_SENT outcome after Customer phone
-- change from an unchanged-phone retry, without storing phone/HMAC material.
-- Forward-only; 086-092 checksums remain intact.
-- Pre-upgrade in-flight attempts have no durable record of 092-era phone
-- changes. Mark ALL pre-existing attempts as uncertain (fail closed for a
-- future proven negative), then default new attempts to known-unchanged.
-- PostgreSQL 17 adds the constant default without a per-row rewrite.
ALTER TABLE public.outbound_message_attempts
  ADD COLUMN recipient_routing_uncertain boolean NOT NULL DEFAULT true;
ALTER TABLE public.outbound_message_attempts
  ALTER COLUMN recipient_routing_uncertain SET DEFAULT false;

-- The Customer UPDATE transaction holds Customer -> Delivery -> Attempt in the
-- same order as the sender permit. An ongoing DISPATCHING is never terminalized
-- by phone change alone because transport outcome may be unknown.
CREATE OR REPLACE FUNCTION outbound_suppress_customer_phone_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE r record;
BEGIN
  IF TG_OP<>'UPDATE' OR TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'customers' THEN
    RAISE EXCEPTION 'OUTBOUND_CUSTOMER_TRIGGER_SCOPE' USING ERRCODE='23514';
  END IF;
  IF OLD.phone_normalized IS NOT DISTINCT FROM NEW.phone_normalized THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT d.id,d.intent_id,d.state
      FROM outbound_message_deliveries d
      JOIN outbound_message_intents i
        ON i.id=d.intent_id AND i.organization_id=d.organization_id
     WHERE i.organization_id=OLD.organization_id AND i.customer_id=OLD.id
       AND d.state IN ('PENDING','LEASED','RETRY_WAIT','DISPATCHING')
     ORDER BY d.created_at,d.id FOR UPDATE OF d
  LOOP
    IF r.state='DISPATCHING' THEN
      UPDATE outbound_message_attempts a
         SET recipient_routing_uncertain=true
       WHERE a.delivery_id=r.id AND a.organization_id=OLD.organization_id
         AND a.state='DISPATCHING';
    ELSE
      UPDATE outbound_message_deliveries
         SET state='SUPPRESSED',terminal_reason='REVOKED',
             next_attempt_at=NULL,lease_token=NULL,lease_expires_at=NULL,
             updated_at=clock_timestamp()
       WHERE id=r.id AND state IN ('PENDING','LEASED','RETRY_WAIT');
      DELETE FROM outbound_message_envelopes WHERE intent_id=r.intent_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- The attempt flag is monotone; after phone change it cannot be cleared.
CREATE OR REPLACE FUNCTION outbound_guard_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'OUTBOUND_ATTEMPT_FENCE' USING ERRCODE='23514';
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.delivery_id <> OLD.delivery_id
    OR NEW.provider_binding_id <> OLD.provider_binding_id OR NEW.ordinal <> OLD.ordinal
    OR NEW.callback_handle <> OLD.callback_handle OR NEW.dispatch_started_at <> OLD.dispatch_started_at
    OR (OLD.provider_message_id IS NOT NULL AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id)
    OR (OLD.state <> 'DISPATCHING' AND NEW.state <> OLD.state)
    OR (OLD.recipient_routing_uncertain
      AND NOT NEW.recipient_routing_uncertain)
  THEN RAISE EXCEPTION 'OUTBOUND_ATTEMPT_FENCE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

-- 086 banned all DISPATCHING -> RETRY_WAIT, contradicting 089's proven
-- NOT_SENT/DEFINITIVE_FAILURE retry contract. Allow that exact transition
-- ONLY after the current ordinal attempt has been durably finalized as known
-- not sent, without provider correlation, positive callback or phone drift.
-- All UNKNOWN/ACCEPTED/SUPPRESSED/etc remain terminal and non-requeueable.
CREATE OR REPLACE FUNCTION outbound_guard_delivery() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'OUTBOUND_DELIVERY_FENCE' USING ERRCODE='23514';
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.intent_id <> OLD.intent_id
     OR NEW.channel <> OLD.channel OR NEW.provider <> OLD.provider
    OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at)
    OR (OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at)
    OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at)
    OR (OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at)
    OR (OLD.failed_at IS NOT NULL AND NEW.failed_at IS DISTINCT FROM OLD.failed_at)
  THEN RAISE EXCEPTION 'OUTBOUND_DELIVERY_FENCE' USING ERRCODE='23514'; END IF;

  IF OLD.state='DISPATCHING' AND NEW.state='RETRY_WAIT' THEN
    IF NEW.attempt_count<>OLD.attempt_count OR NOT EXISTS(
      SELECT 1 FROM outbound_message_attempts a
       WHERE a.organization_id=OLD.organization_id
         AND a.delivery_id=OLD.id AND a.ordinal=OLD.attempt_count
         AND a.state IN ('NOT_SENT','DEFINITIVE_FAILURE')
         AND a.provider_message_id IS NULL
         AND NOT a.recipient_routing_uncertain
         AND NOT EXISTS(
           SELECT 1 FROM outbound_message_events e
            WHERE e.organization_id=a.organization_id AND e.delivery_id=a.delivery_id
              AND e.attempt_id=a.id AND e.provider_binding_id=a.provider_binding_id
              AND e.event_kind IN ('SENT','DELIVERED','READ')
         )
    ) THEN RAISE EXCEPTION 'OUTBOUND_NO_REQUEUE' USING ERRCODE='23514'; END IF;
  ELSIF (OLD.state IN ('DISPATCHING','UNKNOWN','ACCEPTED','PERMANENT_FAILURE','SUPPRESSED','EXPIRED')
     AND NEW.state IN ('PENDING','LEASED','RETRY_WAIT'))
     OR (OLD.state IN ('UNKNOWN','ACCEPTED','PERMANENT_FAILURE','SUPPRESSED','EXPIRED')
       AND NEW.state<>OLD.state)
  THEN RAISE EXCEPTION 'OUTBOUND_NO_REQUEUE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;

-- Exactly the 089 6-argument finalizer, with one additional persisted
-- post-result fence for proven negative outcomes after Customer phone drift.
-- The 089 7-argument retry-after wrapper delegates to this function.
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

  -- Durable signed callback evidence always wins, even if phone later changes.
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
  v_next:=CASE WHEN v_a.recipient_routing_uncertain
      AND p_outcome IN ('NOT_SENT','DEFINITIVE_FAILURE') THEN 'SUPPRESSED'
    WHEN p_outcome IN ('NOT_SENT','DEFINITIVE_FAILURE')
      AND v_d.attempt_count<v_d.max_attempts
      AND v_now + make_interval(secs=>v_delay) < v_deadline-interval '10 seconds'
      THEN 'RETRY_WAIT'
    WHEN p_outcome IN ('NOT_SENT','DEFINITIVE_FAILURE') THEN 'PERMANENT_FAILURE'
    ELSE p_outcome END;
  UPDATE outbound_message_attempts SET state=p_outcome,provider_message_id=p_message_id,
    safe_code=p_safe_code WHERE id=p_attempt;
  UPDATE outbound_message_deliveries SET state=v_next,lease_token=NULL,lease_expires_at=NULL,
    next_attempt_at=CASE WHEN v_next='RETRY_WAIT'
      THEN v_now + make_interval(secs=>v_delay) ELSE NULL END,
    accepted_at=CASE WHEN p_outcome='ACCEPTED' THEN v_now ELSE accepted_at END,
    terminal_reason=CASE WHEN v_next='UNKNOWN' THEN 'UNKNOWN'
      WHEN v_next='PERMANENT_FAILURE' THEN 'PERMANENT'
      WHEN v_next='SUPPRESSED' THEN 'REVOKED' ELSE terminal_reason END,
    updated_at=v_now WHERE id=p_delivery;
  IF v_next<>'RETRY_WAIT' THEN
    DELETE FROM outbound_message_envelopes WHERE intent_id=v_d.intent_id;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION outbound_suppress_customer_phone_change(),
  outbound_guard_attempt(),outbound_guard_delivery(),
  outbound_finish_attempt(uuid,uuid,uuid,text,text,text) FROM PUBLIC;

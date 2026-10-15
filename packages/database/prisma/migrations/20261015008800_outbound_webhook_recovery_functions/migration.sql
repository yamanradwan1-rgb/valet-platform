-- Called immediately before HTTP construction; no stale lease is reusable.
CREATE FUNCTION outbound_confirm_dispatch(p_delivery uuid,p_lease uuid,p_attempt uuid,
  p_digest text,p_phone text) RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM outbound_message_attempts a
      JOIN outbound_message_deliveries d ON d.id=a.delivery_id AND d.organization_id=a.organization_id
      JOIN outbound_message_intents i ON i.id=d.intent_id AND i.organization_id=d.organization_id
      JOIN valet_sessions s ON s.id=i.valet_session_id AND s.organization_id=i.organization_id
        AND s.location_id=i.location_id AND s.customer_id=i.customer_id
      JOIN customers c ON c.id=i.customer_id AND c.organization_id=i.organization_id
      JOIN outbound_messaging_permissions p ON p.id=i.permission_id AND p.organization_id=i.organization_id
      JOIN outbound_messaging_policies po ON po.id=i.policy_id AND po.organization_id=i.organization_id
      JOIN outbound_messaging_policies pc ON pc.organization_id=i.organization_id
        AND pc.purpose=i.purpose AND pc.location_id IS NULL
      LEFT JOIN outbound_messaging_policies pl ON pl.organization_id=i.organization_id
        AND pl.purpose=i.purpose AND pl.location_id=i.location_id
      JOIN outbound_provider_bindings b ON b.id=i.provider_binding_id AND b.organization_id=i.organization_id
      JOIN outbound_messaging_control k ON k.environment=b.environment
    WHERE a.id=p_attempt AND a.delivery_id=p_delivery AND a.state='DISPATCHING'
      AND d.state='DISPATCHING' AND d.lease_token=p_lease
      AND d.lease_expires_at>clock_timestamp()+interval '10 seconds'
      AND i.expires_at>clock_timestamp()+interval '10 seconds'
      AND i.recipient_digest=p_digest AND p.recipient_digest=p_digest
      AND c.phone_normalized=p_phone
      AND p.revision=i.permission_revision AND p.withdrawn_at IS NULL
      AND p.collected_at<=clock_timestamp()
      AND (p.expires_at IS NULL OR p.expires_at>clock_timestamp())
      AND pc.revision=i.company_policy_revision
      AND po.revision=i.policy_revision
      AND po.id=COALESCE(pl.id,pc.id)
      AND (po.id=pc.id OR po.location_id=i.location_id)
      AND COALESCE(pl.enabled,pc.enabled,false)
      AND COALESCE(pl.language,pc.language)=i.language
      AND COALESCE(pl.template_catalog_version,pc.template_catalog_version)=i.template_catalog_version
      AND COALESCE(pl.provider_binding_id,pc.provider_binding_id)=i.provider_binding_id
      AND b.enabled AND b.provider_verified_at IS NOT NULL
      AND b.revision=i.binding_revision AND k.send_enabled
      AND s.customer_access_generation=i.credential_generation
      AND s.customer_access_revoked_at IS NULL AND s.customer_access_consumed_at IS NULL
      AND s.customer_access_expires_at>clock_timestamp()
      AND s.state NOT IN ('COMPLETED','CANCELLED')
  )
$$;

CREATE FUNCTION outbound_finish_attempt(p_delivery uuid,p_lease uuid,p_attempt uuid,
  p_outcome text,p_message_id text,p_safe_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_d outbound_message_deliveries%ROWTYPE; v_a outbound_message_attempts%ROWTYPE;
  v_next text; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_outcome NOT IN ('ACCEPTED','UNKNOWN','NOT_SENT','DEFINITIVE_FAILURE','PERMANENT_FAILURE')
    OR (p_outcome='ACCEPTED' AND (p_message_id IS NULL OR length(p_message_id)>255))
  THEN RAISE EXCEPTION 'OUTBOUND_RESULT_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_d FROM outbound_message_deliveries WHERE id=p_delivery FOR UPDATE;
  SELECT * INTO v_a FROM outbound_message_attempts
    WHERE id=p_attempt AND delivery_id=p_delivery AND organization_id=v_d.organization_id FOR UPDATE;
  IF v_a.id IS NULL OR v_d.lease_token IS DISTINCT FROM p_lease OR v_d.state<>'DISPATCHING'
    OR v_a.state<>'DISPATCHING' THEN RETURN false; END IF;
  v_next:=CASE WHEN p_outcome='DEFINITIVE_FAILURE' AND v_d.attempt_count<v_d.max_attempts
    AND EXISTS(SELECT 1 FROM outbound_message_intents i WHERE i.id=v_d.intent_id AND i.expires_at>v_now+interval '10 seconds')
    THEN 'RETRY_WAIT' WHEN p_outcome='NOT_SENT' AND v_d.attempt_count<v_d.max_attempts
    THEN 'RETRY_WAIT' WHEN p_outcome IN ('DEFINITIVE_FAILURE','NOT_SENT') THEN 'PERMANENT_FAILURE'
    ELSE p_outcome END;
  UPDATE outbound_message_attempts SET state=p_outcome,provider_message_id=p_message_id,
    safe_code=p_safe_code WHERE id=p_attempt;
  UPDATE outbound_message_deliveries SET state=v_next,lease_token=NULL,lease_expires_at=NULL,
    next_attempt_at=CASE WHEN v_next='RETRY_WAIT' THEN v_now+interval '30 seconds' ELSE NULL END,
    accepted_at=CASE WHEN p_outcome='ACCEPTED' THEN v_now ELSE accepted_at END,
    terminal_reason=CASE WHEN v_next='UNKNOWN' THEN 'UNKNOWN'
      WHEN v_next='PERMANENT_FAILURE' THEN 'PERMANENT' ELSE terminal_reason END,
    updated_at=v_now WHERE id=p_delivery;
  IF v_next<>'RETRY_WAIT' THEN DELETE FROM outbound_message_envelopes WHERE intent_id=v_d.intent_id; END IF;
  RETURN true;
END $$;

-- Webhook has no trusted tenant input: organization is inferred only from stored attempt/binding.
CREATE FUNCTION outbound_record_provider_event(p_binding uuid,p_handle uuid,p_message_id text,
  p_recipient_digest text,p_kind text,p_provider_time timestamptz,p_dedupe text,p_safe_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_a outbound_message_attempts%ROWTYPE; v_d outbound_message_deliveries%ROWTYPE;
  v_i outbound_message_intents%ROWTYPE; v_time timestamptz;
BEGIN
  IF p_kind NOT IN ('SENT','DELIVERED','READ','FAILED') OR p_dedupe !~ '^[a-f0-9]{64}$'
    OR (p_handle IS NULL AND p_message_id IS NULL)
  THEN RAISE EXCEPTION 'OUTBOUND_EVENT_INVALID' USING ERRCODE='22023'; END IF;
  -- Immutable attempt lookup precedes acquiring the delivery lock, to match sender lock order.
  SELECT * INTO v_a FROM outbound_message_attempts
    WHERE provider_binding_id=p_binding AND
      ((p_handle IS NOT NULL AND callback_handle=p_handle)
        OR (p_message_id IS NOT NULL AND provider_message_id=p_message_id));
  IF NOT FOUND OR (p_handle IS NOT NULL AND p_handle<>v_a.callback_handle)
    OR (p_message_id IS NOT NULL AND v_a.provider_message_id IS NOT NULL AND p_message_id<>v_a.provider_message_id)
  THEN RETURN false; END IF;
  SELECT * INTO v_d FROM outbound_message_deliveries WHERE id=v_a.delivery_id FOR UPDATE;
  SELECT * INTO v_a FROM outbound_message_attempts WHERE id=v_a.id FOR UPDATE;
  SELECT * INTO v_i FROM outbound_message_intents WHERE id=v_d.intent_id;
  IF v_i.recipient_digest<>p_recipient_digest THEN RETURN false; END IF;
  IF p_message_id IS NOT NULL AND v_a.provider_message_id IS NULL
  THEN UPDATE outbound_message_attempts SET provider_message_id=p_message_id WHERE id=v_a.id; END IF;
  INSERT INTO outbound_message_events(organization_id,delivery_id,attempt_id,provider_binding_id,
    dedupe_digest,event_kind,provider_occurred_at,safe_code)
  VALUES(v_a.organization_id,v_a.delivery_id,v_a.id,p_binding,p_dedupe,p_kind,p_provider_time,p_safe_code)
    ON CONFLICT(provider_binding_id,dedupe_digest) DO NOTHING;
  IF NOT FOUND THEN RETURN true; END IF;
  v_time:=COALESCE(p_provider_time,clock_timestamp());
  UPDATE outbound_message_deliveries SET
    sent_at=CASE WHEN p_kind='SENT' THEN COALESCE(sent_at,v_time) ELSE sent_at END,
    delivered_at=CASE WHEN p_kind='DELIVERED' THEN COALESCE(delivered_at,v_time) ELSE delivered_at END,
    read_at=CASE WHEN p_kind='READ' THEN COALESCE(read_at,v_time) ELSE read_at END,
    failed_at=CASE WHEN p_kind='FAILED' THEN COALESCE(failed_at,v_time) ELSE failed_at END,
    updated_at=clock_timestamp() WHERE id=v_d.id;
  RETURN true;
END $$;

-- Bounded stale work recovery. A DISPATCHING crash is UNKNOWN, never retryable.
CREATE FUNCTION outbound_cleanup_stale(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r record; v_expired boolean; v_count integer:=0; v_now timestamptz;
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'OUTBOUND_CLEANUP_LIMIT' USING ERRCODE='22023'; END IF;
  FOR r IN
    SELECT d.id,d.intent_id,d.state,i.expires_at
      FROM outbound_message_deliveries d
      JOIN outbound_message_intents i ON i.id=d.intent_id AND i.organization_id=d.organization_id
      WHERE (i.expires_at <= clock_timestamp() AND d.state IN ('PENDING','LEASED','DISPATCHING','RETRY_WAIT'))
        OR (d.state='DISPATCHING' AND d.lease_expires_at <= clock_timestamp())
      ORDER BY i.expires_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT p_limit
  LOOP
    v_now:=clock_timestamp();
    v_expired:=r.expires_at<=v_now;
    UPDATE outbound_message_deliveries
      SET state=CASE WHEN r.state='DISPATCHING' THEN 'UNKNOWN' ELSE 'EXPIRED' END,
        terminal_reason=CASE WHEN r.state='DISPATCHING' THEN 'UNKNOWN' ELSE 'EXPIRED' END,
        lease_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=v_now
      WHERE id=r.id;
    IF r.state='DISPATCHING' THEN
      UPDATE outbound_message_attempts SET state='UNKNOWN'
        WHERE delivery_id=r.id AND state='DISPATCHING';
    END IF;
    DELETE FROM outbound_message_envelopes WHERE intent_id=r.intent_id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $$;

-- Stable name consumed by worker recovery after lease/process death.
CREATE FUNCTION outbound_recover_expired(p_limit integer)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT outbound_cleanup_stale(p_limit)
$$;

-- Callback ingress can resolve only the immutable owning account/binding, with no secret or Customer fields.
CREATE FUNCTION outbound_resolve_meta_binding(p_waba text,p_phone text,p_environment text)
RETURNS TABLE(binding_id uuid,organization_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT b.id,b.organization_id FROM outbound_provider_bindings b
   WHERE b.provider='META_CLOUD' AND b.waba_id=p_waba
     AND b.phone_number_id=p_phone AND b.environment=p_environment
     AND length(p_waba) BETWEEN 1 AND 128 AND length(p_phone) BETWEEN 1 AND 128
     AND p_environment IN ('test','production')
$$;

CREATE FUNCTION outbound_permission_change(p_org uuid,p_digest text,p_evidence text,
  p_collected timestamptz,p_expires timestamptz,p_expected integer,p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r outbound_messaging_permissions%ROWTYPE; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_action NOT IN ('GRANT','WITHDRAW') OR length(p_evidence) NOT BETWEEN 8 AND 160
    OR p_digest !~ '^hmac:v[0-9]+:[A-Za-z0-9_-]{32,128}$'
  THEN RAISE EXCEPTION 'OUTBOUND_PERMISSION_INVALID' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM outbound_messaging_permissions
   WHERE organization_id=p_org AND recipient_digest=p_digest AND purpose='INITIAL_GUEST_ACCESS' FOR UPDATE;
  IF NOT FOUND THEN
    IF p_action <> 'GRANT' OR p_expected IS DISTINCT FROM 0 OR p_collected IS NULL OR p_collected > v_now OR p_expires <= v_now
    THEN RAISE EXCEPTION 'OUTBOUND_PERMISSION_REVISION' USING ERRCODE='40001'; END IF;
    INSERT INTO outbound_messaging_permissions(organization_id,recipient_digest,purpose,evidence_reference,collected_at,expires_at)
      VALUES(p_org,p_digest,'INITIAL_GUEST_ACCESS',p_evidence,p_collected,p_expires) RETURNING * INTO r;
  ELSE
    IF r.revision <> p_expected THEN RAISE EXCEPTION 'OUTBOUND_PERMISSION_REVISION' USING ERRCODE='40001'; END IF;
    IF p_action='GRANT' AND (p_collected IS NULL OR p_collected <= r.collected_at OR p_collected > v_now OR p_expires <= v_now)
    THEN RAISE EXCEPTION 'OUTBOUND_PERMISSION_OLD_EVIDENCE' USING ERRCODE='22023'; END IF;
    UPDATE outbound_messaging_permissions SET
      revision=r.revision+1,evidence_reference=p_evidence,
      collected_at=CASE WHEN p_action='GRANT' THEN p_collected ELSE collected_at END,
      expires_at=CASE WHEN p_action='GRANT' THEN p_expires ELSE expires_at END,
      withdrawn_at=CASE WHEN p_action='WITHDRAW' THEN v_now ELSE NULL END,
      updated_at=v_now WHERE id=r.id RETURNING * INTO r;
  END IF;
  INSERT INTO outbound_permission_events(organization_id,permission_id,revision,action,evidence_reference)
    VALUES(p_org,r.id,r.revision,p_action,p_evidence);
  RETURN r.id;
END $$;

CREATE FUNCTION outbound_purge_expired_envelopes(p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;
BEGIN
  IF p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'OUTBOUND_PURGE_LIMIT' USING ERRCODE='22023'; END IF;
  WITH expired AS (
    SELECT e.intent_id FROM outbound_message_envelopes e
    JOIN outbound_message_intents i ON i.id=e.intent_id
    JOIN outbound_message_deliveries d ON d.intent_id=i.id
    WHERE e.purge_at <= clock_timestamp() OR i.expires_at <= clock_timestamp()
      OR d.state IN ('ACCEPTED','UNKNOWN','PERMANENT_FAILURE','SUPPRESSED','EXPIRED')
    ORDER BY e.purge_at,e.intent_id FOR UPDATE OF e SKIP LOCKED LIMIT p_limit
  ) DELETE FROM outbound_message_envelopes e USING expired x WHERE e.intent_id=x.intent_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;

-- Prevent a new Location override being created during sender's company-policy lock.
-- The issuer and sender must also lock the same company default before reading overrides.
CREATE FUNCTION outbound_guard_policy_create() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.location_id IS NOT NULL THEN
    PERFORM 1 FROM outbound_messaging_policies pc
      WHERE pc.organization_id=NEW.organization_id AND pc.purpose=NEW.purpose
        AND pc.location_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OUTBOUND_COMPANY_POLICY_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_policy_create BEFORE INSERT ON outbound_messaging_policies
  FOR EACH ROW EXECUTE FUNCTION outbound_guard_policy_create();

REVOKE ALL ON FUNCTION outbound_guard_immutable(),outbound_guard_delivery(),outbound_guard_attempt(),
  outbound_guard_configuration(),outbound_guard_policy_create(),
  outbound_claim_due(integer),outbound_release_lease(uuid,uuid,timestamptz),
  outbound_lease_recipient(uuid,uuid),outbound_dispatch_permit(uuid,uuid,text),
  outbound_confirm_dispatch(uuid,uuid,uuid,text,text),
  outbound_finish_attempt(uuid,uuid,uuid,text,text,text),
  outbound_record_provider_event(uuid,uuid,text,text,text,timestamptz,text,text),
  outbound_resolve_meta_binding(text,text,text),
  outbound_cleanup_stale(integer),
  outbound_recover_expired(integer),
  outbound_permission_change(uuid,text,text,timestamptz,timestamptz,integer,text),
  outbound_purge_expired_envelopes(integer) FROM PUBLIC;

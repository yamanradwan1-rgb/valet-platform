-- DB functions, each SECURITY DEFINER and callable only by an explicitly provisioned principal.
CREATE FUNCTION outbound_claim_due(p_limit integer)
RETURNS TABLE(delivery_id uuid,organization_id uuid,intent_id uuid,lease_token uuid,lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 10 THEN RAISE EXCEPTION 'OUTBOUND_CLAIM_LIMIT' USING ERRCODE='22023'; END IF;
  RETURN QUERY
    WITH candidates AS (
      SELECT d.id FROM outbound_message_deliveries d
      JOIN outbound_message_intents i ON i.id=d.intent_id AND i.organization_id=d.organization_id
      JOIN outbound_provider_bindings b ON b.id=i.provider_binding_id AND b.organization_id=i.organization_id
        AND b.enabled AND b.provider_verified_at IS NOT NULL
      JOIN outbound_messaging_control c ON c.environment=b.environment AND c.send_enabled
      WHERE d.state IN ('PENDING','RETRY_WAIT','LEASED')
        AND (d.state <> 'LEASED' OR d.lease_expires_at <= clock_timestamp())
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= clock_timestamp())
        AND i.expires_at > clock_timestamp() AND d.attempt_count < d.max_attempts
      ORDER BY d.next_attempt_at,d.created_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT p_limit
    )
    UPDATE outbound_message_deliveries d SET state='LEASED',lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp()
    FROM candidates k WHERE d.id=k.id
    RETURNING d.id,d.organization_id,d.intent_id,d.lease_token,d.lease_expires_at;
END $$;

CREATE FUNCTION outbound_release_lease(p_delivery uuid,p_lease uuid,p_next timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE outbound_message_deliveries d SET state='RETRY_WAIT',next_attempt_at=p_next,
    lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
  WHERE d.id=p_delivery AND d.lease_token=p_lease AND d.state='LEASED';
  RETURN FOUND;
END $$;

-- Returns a canonical phone only for an unexpired, exclusively held lease.
-- Sender derives the keyed HMAC itself; the digest comparison is repeated during permit.
CREATE FUNCTION outbound_lease_recipient(p_delivery uuid,p_lease uuid)
RETURNS TABLE(phone_normalized text,recipient_digest text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  RETURN QUERY SELECT c.phone_normalized,i.recipient_digest
  FROM outbound_message_deliveries d
  JOIN outbound_message_intents i ON i.id=d.intent_id AND i.organization_id=d.organization_id
  JOIN valet_sessions s ON s.id=i.valet_session_id AND s.organization_id=i.organization_id
    AND s.location_id=i.location_id AND s.customer_id=i.customer_id
  JOIN customers c ON c.id=i.customer_id AND c.organization_id=i.organization_id
  JOIN outbound_messaging_permissions p ON p.id=i.permission_id
    AND p.organization_id=i.organization_id AND p.recipient_digest=i.recipient_digest
    AND p.revision=i.permission_revision AND p.withdrawn_at IS NULL
    AND p.collected_at<=clock_timestamp()
    AND (p.expires_at IS NULL OR p.expires_at>clock_timestamp())
  JOIN outbound_provider_bindings b ON b.id=i.provider_binding_id AND b.organization_id=i.organization_id
  JOIN outbound_messaging_control k ON k.environment=b.environment AND k.send_enabled
  WHERE d.id=p_delivery AND d.lease_token=p_lease AND d.state='LEASED'
    AND d.lease_expires_at>clock_timestamp() AND i.expires_at>clock_timestamp()
    AND s.customer_access_generation=i.credential_generation
    AND s.customer_access_revoked_at IS NULL
    AND s.customer_access_consumed_at IS NULL
    AND s.customer_access_expires_at>clock_timestamp()
    AND s.state NOT IN ('COMPLETED','CANCELLED')
    AND b.enabled AND b.provider_verified_at IS NOT NULL;
END $$;

-- Scope, consent and dispatch budget are fenced before issuing any recoverable ciphertext.
CREATE FUNCTION outbound_dispatch_permit(p_delivery uuid,p_lease uuid,p_recipient_digest text)
RETURNS TABLE(attempt_id uuid,ordinal integer,callback_handle uuid,phone_normalized text,
  ciphertext bytea,aad_label bytea,key_version text,aad_version integer,
  binding_id uuid,phone_number_id text,waba_id text,provider_environment text,
  organization_id uuid,location_id uuid,valet_session_id uuid,customer_id uuid,
  credential_generation integer,recipient_digest text,expires_at timestamptz,
  intent_id uuid,template_catalog_version text,language text,config_alias text,
  remaining_seconds numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_d outbound_message_deliveries%ROWTYPE;
  v_i outbound_message_intents%ROWTYPE;
  v_s valet_sessions%ROWTYPE;
  v_c customers%ROWTYPE;
  v_p outbound_messaging_permissions%ROWTYPE;
  v_policy outbound_messaging_policies%ROWTYPE;
  v_company_policy outbound_messaging_policies%ROWTYPE;
  v_location_policy outbound_messaging_policies%ROWTYPE;
  v_binding outbound_provider_bindings%ROWTYPE;
  v_envelope outbound_message_envelopes%ROWTYPE;
  v_budget outbound_message_budgets%ROWTYPE;
  v_now timestamptz;
  v_tokens numeric;
  v_next timestamptz;
  v_attempt outbound_message_attempts%ROWTYPE;
BEGIN
  SELECT i.* INTO v_i FROM outbound_message_intents i
    JOIN outbound_message_deliveries d ON d.intent_id=i.id AND d.organization_id=i.organization_id
    WHERE d.id=p_delivery;
  IF NOT FOUND THEN RAISE EXCEPTION 'OUTBOUND_SCOPE' USING ERRCODE='P0001'; END IF;
  SELECT s.* INTO v_s FROM valet_sessions s
    WHERE s.id=v_i.valet_session_id AND s.organization_id=v_i.organization_id
      AND s.location_id=v_i.location_id FOR UPDATE;
  SELECT c.* INTO v_c FROM customers c
    WHERE c.id=v_i.customer_id AND c.organization_id=v_i.organization_id FOR UPDATE;
  SELECT p.* INTO v_p FROM outbound_messaging_permissions p
    WHERE p.id=v_i.permission_id AND p.organization_id=v_i.organization_id FOR UPDATE;
  SELECT pc.* INTO v_company_policy FROM outbound_messaging_policies pc
    WHERE pc.organization_id=v_i.organization_id
      AND pc.purpose=v_i.purpose AND pc.location_id IS NULL FOR UPDATE;
  SELECT pl.* INTO v_location_policy FROM outbound_messaging_policies pl
    WHERE pl.organization_id=v_i.organization_id AND pl.location_id=v_i.location_id
      AND pl.purpose=v_i.purpose FOR UPDATE;
  SELECT po.* INTO v_policy FROM outbound_messaging_policies po
    WHERE po.id=v_i.policy_id AND po.organization_id=v_i.organization_id FOR UPDATE;
  SELECT d.* INTO v_d FROM outbound_message_deliveries d WHERE d.id=p_delivery FOR UPDATE;
  SELECT b.* INTO v_binding FROM outbound_provider_bindings b
    WHERE b.id=v_i.provider_binding_id AND b.organization_id=v_i.organization_id FOR UPDATE;
  v_now:=clock_timestamp();
  IF v_d.lease_token IS DISTINCT FROM p_lease OR v_d.state <> 'LEASED'
    OR v_d.lease_expires_at <= v_now + interval '11 seconds'
    OR v_i.expires_at <= v_now + interval '11 seconds'
    OR v_d.attempt_count >= v_d.max_attempts OR v_i.recipient_digest <> p_recipient_digest
    OR v_s.id IS NULL OR v_c.id IS NULL OR v_s.customer_id IS DISTINCT FROM v_i.customer_id
    OR v_s.state IN ('COMPLETED','CANCELLED')
    OR v_s.customer_access_generation <> v_i.credential_generation
    OR v_s.customer_access_revoked_at IS NOT NULL OR v_s.customer_access_consumed_at IS NOT NULL
    OR v_s.customer_access_token_hash NOT LIKE 'sha256:v1:%'
    OR v_s.customer_access_expires_at <= v_now OR v_p.id IS NULL
    OR v_p.recipient_digest <> p_recipient_digest OR v_p.revision <> v_i.permission_revision
    OR v_p.withdrawn_at IS NOT NULL OR v_p.collected_at > v_now
    OR (v_p.expires_at IS NOT NULL AND v_p.expires_at <= v_now)
    OR v_company_policy.id IS NULL OR v_company_policy.revision <> v_i.company_policy_revision
    OR v_policy.id IS NULL OR v_policy.revision <> v_i.policy_revision
    OR v_policy.id IS DISTINCT FROM COALESCE(v_location_policy.id,v_company_policy.id)
    OR (v_policy.id<>v_company_policy.id
      AND v_policy.location_id IS DISTINCT FROM v_i.location_id)
    OR (v_policy.id=v_company_policy.id AND v_policy.location_id IS NOT NULL)
    OR COALESCE(v_location_policy.enabled,v_company_policy.enabled,false) IS DISTINCT FROM true
    OR COALESCE(v_location_policy.language,v_company_policy.language) IS DISTINCT FROM v_i.language
    OR COALESCE(v_location_policy.template_catalog_version,v_company_policy.template_catalog_version)
      IS DISTINCT FROM v_i.template_catalog_version
    OR COALESCE(v_location_policy.provider_binding_id,v_company_policy.provider_binding_id)
      IS DISTINCT FROM v_i.provider_binding_id
    OR v_binding.id IS NULL OR v_binding.revision <> v_i.binding_revision
    OR NOT v_binding.enabled OR v_binding.provider_verified_at IS NULL
    OR NOT EXISTS (SELECT 1 FROM outbound_messaging_control k
      WHERE k.environment=v_binding.environment AND k.send_enabled)
  THEN RAISE EXCEPTION 'OUTBOUND_INELIGIBLE' USING ERRCODE='P0001'; END IF;
  SELECT e.* INTO v_envelope FROM outbound_message_envelopes e
    WHERE e.intent_id=v_i.id AND e.organization_id=v_i.organization_id FOR UPDATE;
  IF v_envelope.intent_id IS NULL OR v_envelope.purge_at <= v_now
  THEN RAISE EXCEPTION 'OUTBOUND_ENVELOPE_EXPIRED' USING ERRCODE='P0001'; END IF;
  IF convert_from(v_envelope.aad_label,'UTF8')::jsonb IS DISTINCT FROM
    jsonb_build_object(
      'version',1,'organizationId',v_i.organization_id::text,'locationId',v_i.location_id::text,
      'sessionId',v_i.valet_session_id::text,'customerId',v_i.customer_id::text,
      'intentId',v_i.id::text,'credentialGeneration',v_i.credential_generation,
      'recipientDigest',v_i.recipient_digest,
      'expiresAt',to_char(v_i.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  THEN RAISE EXCEPTION 'OUTBOUND_AAD_SCOPE_MISMATCH' USING ERRCODE='P0001'; END IF;
  SELECT bud.* INTO v_budget FROM outbound_message_budgets bud WHERE bud.provider_binding_id=v_binding.id FOR UPDATE;
  IF v_budget.provider_binding_id IS NULL THEN RAISE EXCEPTION 'OUTBOUND_BUDGET_MISSING' USING ERRCODE='P0001'; END IF;
  v_tokens:=LEAST(v_budget.capacity,v_budget.tokens
    + GREATEST(0,EXTRACT(EPOCH FROM v_now-v_budget.last_refill_at))*v_budget.refill_per_second);
  IF v_tokens < 1 THEN RAISE EXCEPTION 'OUTBOUND_BUDGET_EXHAUSTED' USING ERRCODE='P0001'; END IF;
  SELECT rb.next_permitted_at INTO v_next FROM outbound_recipient_budgets rb
    WHERE rb.provider_binding_id=v_binding.id AND rb.recipient_digest=p_recipient_digest FOR UPDATE;
  IF v_next > v_now THEN RAISE EXCEPTION 'OUTBOUND_RECIPIENT_THROTTLED' USING ERRCODE='P0001'; END IF;
  UPDATE outbound_message_budgets SET tokens=v_tokens-1,last_refill_at=v_now,
    revision=revision+1 WHERE provider_binding_id=v_binding.id;
  INSERT INTO outbound_recipient_budgets(provider_binding_id,recipient_digest,next_permitted_at,expires_at)
    VALUES(v_binding.id,p_recipient_digest,v_now+interval '30 seconds',v_now+interval '1 hour')
    ON CONFLICT ON CONSTRAINT outbound_recipient_budgets_pkey DO UPDATE
      SET next_permitted_at=EXCLUDED.next_permitted_at,expires_at=EXCLUDED.expires_at;
  INSERT INTO outbound_message_attempts(organization_id,delivery_id,provider_binding_id,ordinal)
    VALUES(v_i.organization_id,p_delivery,v_binding.id,v_d.attempt_count+1) RETURNING * INTO v_attempt;
  UPDATE outbound_message_deliveries SET state='DISPATCHING',attempt_count=attempt_count+1,
    updated_at=v_now WHERE id=p_delivery;
  RETURN QUERY SELECT v_attempt.id,v_attempt.ordinal,v_attempt.callback_handle,v_c.phone_normalized,
    v_envelope.ciphertext,v_envelope.aad_label,v_envelope.key_version,v_envelope.aad_version,
    v_binding.id,v_binding.phone_number_id,v_binding.waba_id,v_binding.environment,
    v_i.organization_id,v_i.location_id,v_i.valet_session_id,v_i.customer_id,
    v_i.credential_generation,v_i.recipient_digest,v_i.expires_at,v_i.id,
    v_i.template_catalog_version,v_i.language,v_binding.config_alias,
    EXTRACT(EPOCH FROM LEAST(v_i.expires_at,v_d.lease_expires_at)-clock_timestamp());
END $$;

REVOKE ALL ON FUNCTION outbound_claim_due(integer),outbound_release_lease(uuid,uuid,timestamptz),outbound_lease_recipient(uuid,uuid),outbound_dispatch_permit(uuid,uuid,text) FROM PUBLIC;

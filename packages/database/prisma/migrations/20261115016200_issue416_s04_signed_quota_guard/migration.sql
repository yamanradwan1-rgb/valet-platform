-- Option C / S04: purpose-limited, one-time signed counter commands.
-- The application runtime has no table write grants once the protected
-- provisioner applies this migration. Proof keys are provisioned separately.
BEGIN;

CREATE SCHEMA s04_quota_guard;
REVOKE ALL ON SCHEMA s04_quota_guard FROM PUBLIC;

CREATE TABLE s04_quota_guard.proof_key (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  key_material bytea NOT NULL CHECK (octet_length(key_material) = 32)
);
CREATE TABLE s04_quota_guard.used_nonce (
  nonce uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX s04_used_nonce_expiry_idx
  ON s04_quota_guard.used_nonce(occurred_at,nonce);
REVOKE ALL ON ALL TABLES IN SCHEMA s04_quota_guard FROM PUBLIC;

CREATE FUNCTION s04_quota_guard.require_proof(
  p_message text, p_nonce uuid, p_expires_ms bigint, p_mac text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE
  v_key bytea;
  v_crypto_schema name;
  v_expected bytea;
  v_now_ms bigint;
BEGIN
  SELECT key_material INTO STRICT v_key FROM s04_quota_guard.proof_key WHERE singleton;
  v_now_ms := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  IF p_expires_ms < v_now_ms OR p_expires_ms > v_now_ms + 30000
     OR p_mac !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'S04_PROOF_INVALID' USING ERRCODE = '42501';
  END IF;
  -- Accept only the true pgcrypto extension member. No search_path lookup.
  SELECT n.nspname INTO STRICT v_crypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_depend d ON d.refobjid=e.oid
    AND d.refclassid='pg_catalog.pg_extension'::regclass
    AND d.classid='pg_catalog.pg_proc'::regclass AND d.deptype='e'
  JOIN pg_catalog.pg_proc p ON p.oid=d.objid
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE e.extname='pgcrypto' AND p.proname='hmac'
    AND p.proargtypes='17 17 25'::pg_catalog.oidvector;
  EXECUTE pg_catalog.format('SELECT %I.hmac($1,$2,%L)',
    v_crypto_schema,'sha256')
    INTO STRICT v_expected
    USING pg_catalog.convert_to(p_message || '|' || p_expires_ms, 'UTF8'), v_key;
  IF v_expected IS DISTINCT FROM pg_catalog.decode(p_mac,'hex') THEN
    RAISE EXCEPTION 'S04_PROOF_INVALID' USING ERRCODE = '42501';
  END IF;
  -- Uniqueness and mutation commit in the same SQL transaction.
  INSERT INTO s04_quota_guard.used_nonce(nonce) VALUES (p_nonce);
EXCEPTION
  WHEN no_data_found OR too_many_rows OR unique_violation
     OR invalid_text_representation THEN
    RAISE EXCEPTION 'S04_PROOF_INVALID' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION s04_quota_guard.require_proof(text,uuid,bigint,text) FROM PUBLIC;

CREATE FUNCTION public.s04_counted(
  p_scope text,p_key text,p_nonce uuid,p_expires_ms bigint,p_mac text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
BEGIN
  PERFORM s04_quota_guard.require_proof(
    's04-v1|COUNTED|' || p_scope || '|' || p_key || '|' || p_nonce,
    p_nonce,p_expires_ms,p_mac
  );
  INSERT INTO public.anti_abuse_events(scope,key_hash,state)
    VALUES(p_scope,p_key,'COUNTED');
END;
$$;
REVOKE ALL ON FUNCTION public.s04_counted(text,text,uuid,bigint,text) FROM PUBLIC;

CREATE FUNCTION public.s04_reserve(
  p_scope text,p_key text,p_nonce uuid,p_expires_ms bigint,p_mac text
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_id text;
BEGIN
  PERFORM s04_quota_guard.require_proof(
    's04-v1|PENDING|' || p_scope || '|' || p_key || '|' || p_nonce,
    p_nonce,p_expires_ms,p_mac
  );
  INSERT INTO public.anti_abuse_events(scope,key_hash,state)
    VALUES(p_scope,p_key,'PENDING') RETURNING id::text INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.s04_reserve(text,text,uuid,bigint,text) FROM PUBLIC;

CREATE FUNCTION public.s04_finalize(
  p_id uuid,p_scope text,p_key text,p_state text,
  p_nonce uuid,p_expires_ms bigint,p_mac text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  IF p_state NOT IN ('COUNTED','IGNORED') THEN
    RAISE EXCEPTION 'S04_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM s04_quota_guard.require_proof(
    's04-v1|FINALIZE|' || p_id || '|' || p_scope || '|' || p_key ||
      '|' || p_state || '|' || p_nonce,
    p_nonce,p_expires_ms,p_mac
  );
  UPDATE public.anti_abuse_events SET state=p_state
  WHERE id=p_id AND scope=p_scope AND key_hash=p_key AND state='PENDING';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.s04_finalize(uuid,text,text,text,uuid,bigint,text)
  FROM PUBLIC;

-- S01 and S02: these execute only on the respective protected writer's
-- existing transaction after the authenticating ceremony succeeds.
-- Writer-role EXECUTE grants are installed by their own role provisioners,
-- never by the ordinary runtime provisioner.
CREATE FUNCTION public.s04_staff_login_success(p_id uuid,p_key text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.anti_abuse_events SET state='IGNORED'
  WHERE id=p_id AND scope='v1:staff-login-identifier'
    AND key_hash=p_key AND state='PENDING';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.s04_staff_login_success(uuid,text) FROM PUBLIC;

CREATE FUNCTION public.s04_mfa_success(p_id uuid,p_scope text,p_key text)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  IF p_scope NOT IN ('v1:mfa-totp-user','v1:mfa-recovery-user') THEN
    RAISE EXCEPTION 'S04_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.anti_abuse_events SET state='IGNORED'
  WHERE id=p_id AND scope=p_scope AND key_hash=p_key AND state='PENDING';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.s04_mfa_success(uuid,text,text) FROM PUBLIC;

CREATE FUNCTION public.s04_guest_classified(
  p_key text,p_group text,p_class text,p_limit integer,
  p_aggregate integer,p_credential integer,
  p_gh integer,p_gl integer,p_kh integer,p_kl integer,
  p_nonce uuid,p_expires_ms bigint,p_mac text
) RETURNS TABLE(id text,retry_after integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_retry integer; v_id text; v_now timestamptz;
BEGIN
  IF p_class NOT IN ('A','B','C','D') OR
     p_limit NOT BETWEEN 1 AND 864 OR
     p_aggregate NOT BETWEEN 1 AND 864 OR
     p_credential NOT BETWEEN 1 AND 864 OR
     p_key !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$' OR
     p_group !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'S04_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  PERFORM s04_quota_guard.require_proof(
    's04-v1|GUEST|' || p_key || '|' || p_group || '|' || p_class ||
    '|' || p_limit || '|' || p_aggregate || '|' || p_credential ||
    '|' || p_gh || '|' || p_gl || '|' || p_kh || '|' || p_kl || '|' || p_nonce,
    p_nonce,p_expires_ms,p_mac
  );
  PERFORM pg_catalog.set_config('lock_timeout','2s',true);
  IF (p_gh,p_gl) <= (p_kh,p_kl) THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(p_gh,p_gl);
    IF (p_gh,p_gl) IS DISTINCT FROM (p_kh,p_kl) THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(p_kh,p_kl);
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(p_kh,p_kl);
    PERFORM pg_catalog.pg_advisory_xact_lock(p_gh,p_gl);
  END IF;
  UPDATE public.anti_abuse_events SET group_key_hash=p_group
  WHERE scope='v1:guest-token' AND key_hash=p_key
    AND group_key_hash IS NULL AND state IN ('PENDING','COUNTED')
    AND occurred_at > clock_timestamp()-interval '15 minutes';
  v_now := clock_timestamp();
  WITH events AS MATERIALIZED (
    SELECT occurred_at,request_class,key_hash FROM public.anti_abuse_events
    WHERE scope='v1:guest-token' AND group_key_hash=p_group
      AND state IN ('PENDING','COUNTED')
      AND occurred_at>v_now-interval '15 minutes'
  ), blockers AS (
    SELECT occurred_at FROM events ORDER BY occurred_at
    OFFSET greatest(0,(SELECT count(*) FROM events)-p_aggregate) LIMIT 1
  ), class_blockers AS (
    SELECT occurred_at FROM events
    WHERE request_class IS NULL OR request_class=p_class
    ORDER BY occurred_at OFFSET greatest(0,(SELECT count(*) FROM events
      WHERE request_class IS NULL OR request_class=p_class)-p_limit) LIMIT 1
  ), credential_blockers AS (
    SELECT occurred_at FROM events WHERE key_hash=p_key ORDER BY occurred_at
    OFFSET greatest(0,(SELECT count(*) FROM events WHERE key_hash=p_key)-p_credential) LIMIT 1
  )
  SELECT greatest(
    CASE WHEN (SELECT count(*) FROM events)>=p_aggregate
      THEN (SELECT ceil(extract(epoch FROM (occurred_at+interval '15 minutes'-v_now)))
            FROM blockers) ELSE 0 END,
    CASE WHEN (SELECT count(*) FROM events
        WHERE request_class IS NULL OR request_class=p_class)>=p_limit
      THEN (SELECT ceil(extract(epoch FROM (occurred_at+interval '15 minutes'-v_now)))
            FROM class_blockers) ELSE 0 END,
    CASE WHEN (SELECT count(*) FROM events WHERE key_hash=p_key)>=p_credential
      THEN (SELECT ceil(extract(epoch FROM (occurred_at+interval '15 minutes'-v_now)))
            FROM credential_blockers) ELSE 0 END
  )::integer INTO v_retry;
  IF v_retry=0 THEN
    INSERT INTO public.anti_abuse_events(scope,key_hash,state,request_class,group_key_hash)
      VALUES('v1:guest-token',p_key,'COUNTED',p_class,p_group)
      RETURNING anti_abuse_events.id::text INTO v_id;
  END IF;
  RETURN QUERY SELECT v_id,least(900,greatest(0,v_retry));
END;
$$;
REVOKE ALL ON FUNCTION public.s04_guest_classified(
  text,text,text,integer,integer,integer,integer,integer,integer,integer,
  uuid,bigint,text) FROM PUBLIC;

-- The caller supplies no key, cutoff or batch. Nonce history outlives the
-- maximum 30-second signature validity, even if cleanup is delayed.
CREATE FUNCTION public.s04_cleanup_nonces()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '200ms'
SET statement_timeout = '500ms' AS $$
DECLARE v_count integer;
BEGIN
  WITH expired AS MATERIALIZED (
    SELECT nonce FROM s04_quota_guard.used_nonce
    WHERE occurred_at < clock_timestamp()-interval '1 hour'
    ORDER BY occurred_at,nonce LIMIT 1000 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM s04_quota_guard.used_nonce n USING expired e WHERE n.nonce=e.nonce;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.s04_cleanup_nonces() FROM PUBLIC;

-- No function grants and no runtime table revocation occur in this migration.
-- The migration owner's independent credential provisioner atomically seeds
-- the proof key, grants exactly the runtime functions above and retires direct
-- INSERT/UPDATE. The runtime provisioner must never reissue legacy grants.
COMMIT;

-- Issue 416 A01: private source-derived admission and committed limiter state.
-- This migration creates no callable runtime signer or broad table grant.
BEGIN;
SET ROLE vap1_proof_owner;

-- Preexisting bindings have unknown provenance and remain ineligible forever.
ALTER TABLE auth_proof_private.limiter_bindings
  ADD COLUMN bound_full_xid numeric(20,0)
  CHECK (bound_full_xid > 0 AND bound_full_xid <= 18446744073709551615);

CREATE FUNCTION auth_proof_private.stamp_a01_limiter_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.purpose <> 'STAFF_LOGIN_COMMIT'
      OR NEW.scope <> 'v1:staff-login-identifier'
      OR NEW.request_fingerprint IS NULL THEN
      RAISE EXCEPTION 'VAP1_A01_BINDING_DENIED' USING ERRCODE = '42501';
    END IF;
    NEW.bound_full_xid := pg_catalog.pg_current_xact_id()::text::numeric;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'VAP1_A01_BINDING_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER issue416_a01_limiter_insert_stamp
  BEFORE INSERT ON auth_proof_private.limiter_bindings
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.stamp_a01_limiter_binding();
CREATE TRIGGER issue416_a01_limiter_immutable
  BEFORE UPDATE OR DELETE ON auth_proof_private.limiter_bindings
  FOR EACH ROW EXECUTE FUNCTION auth_proof_private.stamp_a01_limiter_binding();

CREATE FUNCTION auth_proof_private.one_state_row_group(
  p_group integer, p_row bytea
) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $$
DECLARE v_group bytea;
BEGIN
  PERFORM auth_proof_private.assert_state_row(p_group,p_row);
  v_group := pg_catalog.substring(
    auth_proof_private.empty_state_group(p_group),1,21
  ) || auth_proof_private.u32(1) || auth_proof_private.u8(6)
    || auth_proof_private.u32(pg_catalog.octet_length(p_row)) || p_row;
  PERFORM auth_proof_private.assert_state_group(p_group,v_group);
  RETURN v_group;
END;
$$;

CREATE FUNCTION auth_proof_private.a01_admission_group(
  p_audience text,p_user_id uuid,p_user_material_digest bytea
) RETURNS bytea LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE a auth_proof_private.authority_admissions%ROWTYPE;
v_boundary auth_proof_private.security_boundary%ROWTYPE;
v_fields bytea;
BEGIN
  SELECT * INTO v_boundary FROM auth_proof_private.security_boundary
    WHERE singleton FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VAP1_A01_ADMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM auth_proof_private.authority_admissions x
    WHERE x.audience = p_audience AND x.object_kind = 'USER'
      AND x.object_key_bytes = '\x01'::bytea || pg_catalog.uuid_send(p_user_id)
    FOR SHARE;
  IF NOT FOUND OR v_boundary.phase <> 'PROTECTED'
    OR v_boundary.deployment_audience IS DISTINCT FROM p_audience
    OR a.disposition <> 'ADMIT'
    OR a.material_digest IS DISTINCT FROM p_user_material_digest THEN
    RAISE EXCEPTION 'VAP1_A01_ADMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  v_fields :=
    auth_proof_private.tlv_field(1,4,pg_catalog.convert_to(a.audience,'UTF8')) ||
    auth_proof_private.tlv_field(2,4,pg_catalog.convert_to('USER','UTF8')) ||
    auth_proof_private.tlv_field(3,6,a.object_key_bytes) ||
    auth_proof_private.tlv_field(4,4,pg_catalog.convert_to(a.disposition,'UTF8')) ||
    auth_proof_private.tlv_field(5,3,auth_proof_private.u64(a.admission_version)) ||
    auth_proof_private.tlv_field(6,3,auth_proof_private.u64(v_boundary.boundary_epoch)) ||
    auth_proof_private.tlv_field(7,7,a.material_digest) ||
    auth_proof_private.tlv_field(8,0,'\x'::bytea);
  RETURN auth_proof_private.one_state_row_group(5,
    auth_proof_private.u16(1) || auth_proof_private.u16(8) || v_fields);
END;
$$;

CREATE FUNCTION auth_proof_private.a01_limiter_group(
  p_audience text,p_operation_id uuid,p_reservation_id uuid,
  p_request_fingerprint bytea
) RETURNS bytea LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE b auth_proof_private.limiter_bindings%ROWTYPE;
DECLARE e record;
DECLARE v_fields bytea;
BEGIN
  SELECT * INTO b FROM auth_proof_private.limiter_bindings x
    WHERE x.reservation_id = p_reservation_id FOR SHARE;
  IF NOT FOUND OR b.audience IS DISTINCT FROM p_audience
    OR b.operation_id IS DISTINCT FROM p_operation_id
    OR b.purpose <> 'STAFF_LOGIN_COMMIT'
    OR b.scope <> 'v1:staff-login-identifier'
    OR b.request_fingerprint IS DISTINCT FROM p_request_fingerprint
    OR b.bound_full_xid IS NULL
    OR b.bound_full_xid = pg_catalog.pg_current_xact_id()::text::numeric THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT scope,key_hash,state INTO e
  FROM public.anti_abuse_events WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR e.scope IS DISTINCT FROM b.scope OR e.state <> 'PENDING'
    OR e.key_hash !~ '^anti-abuse-hmac-sha256:v1:[0-9a-f]{64}$'
    OR b.key_digest IS DISTINCT FROM
      pg_catalog.decode(pg_catalog.split_part(e.key_hash,':',3),'hex') THEN
    RAISE EXCEPTION 'VAP1_A01_LIMITER_DENIED' USING ERRCODE = '42501';
  END IF;
  v_fields :=
    auth_proof_private.tlv_field(1,5,pg_catalog.uuid_send(p_reservation_id)) ||
    auth_proof_private.tlv_field(2,4,pg_catalog.convert_to(b.scope,'UTF8')) ||
    auth_proof_private.tlv_field(3,7,b.key_digest) ||
    auth_proof_private.tlv_field(4,4,pg_catalog.convert_to(e.state,'UTF8')) ||
    auth_proof_private.tlv_field(5,5,pg_catalog.uuid_send(b.operation_id));
  RETURN auth_proof_private.one_state_row_group(19,
    auth_proof_private.u16(1) || auth_proof_private.u16(5) || v_fields);
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.stamp_a01_limiter_binding()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.one_state_row_group(integer,bytea)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_admission_group(text,uuid,bytea)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_limiter_group(
  text,uuid,uuid,bytea) FROM PUBLIC;
RESET ROLE;
COMMIT;

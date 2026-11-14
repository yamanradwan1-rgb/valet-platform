-- Issue416 A01: exact source-derived User state and closed login payload.
-- Private-only codec/validation support for future protected prepare/execute.
-- A SQL-visible password PHC digest is NOT proof of password possession.
BEGIN;
GRANT SELECT(id,email,password_hash,status) ON public.users TO vap1_proof_owner;
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.user_state_row_v1(p_user_id uuid)
RETURNS bytea LANGUAGE plpgsql VOLATILE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_user record;
  v_fields bytea;
  v_prefix bytea;
  v_row bytea;
BEGIN
  SELECT u.id,u.email,u.status::text AS status,u.password_hash
    INTO v_user
  FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND OR v_user.status NOT IN ('ACTIVE','PENDING','DISABLED')
    OR v_user.email IS NULL OR pg_catalog.octet_length(
      pg_catalog.convert_to(v_user.email,'UTF8')) > 256
  THEN
    RAISE EXCEPTION 'VAP1_USER_STATE_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  v_fields :=
    auth_proof_private.tlv_field(1,5,pg_catalog.uuid_send(v_user.id)) ||
    auth_proof_private.tlv_field(2,4,pg_catalog.convert_to(v_user.email,'UTF8')) ||
    auth_proof_private.tlv_field(3,4,pg_catalog.convert_to(v_user.status,'UTF8')) ||
    auth_proof_private.tlv_field(4,
      CASE WHEN v_user.password_hash IS NULL THEN 0 ELSE 7 END,
      CASE WHEN v_user.password_hash IS NULL THEN '\x'::bytea
        ELSE pg_catalog.sha256(pg_catalog.convert_to(
          v_user.password_hash,'UTF8')) END);
  -- Class/schema prefix over precisely the preceding four typed attributes.
  v_prefix := auth_proof_private.u16(1) ||
    auth_proof_private.u16(4) || v_fields;
  v_row := auth_proof_private.u16(1) ||
    auth_proof_private.u16(5) || v_fields ||
    auth_proof_private.tlv_field(5,7,pg_catalog.sha256(v_prefix));
  PERFORM auth_proof_private.assert_state_row(6,v_row);
  RETURN v_row;
END;
$$;

CREATE FUNCTION auth_proof_private.user_state_group_v1(p_user_id uuid)
RETURNS bytea LANGUAGE plpgsql VOLATILE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_row bytea;
  v_group bytea;
BEGIN
  v_row := auth_proof_private.user_state_row_v1(p_user_id);
  -- The empty group header carries schema and registered row kind 0x11.
  v_group := pg_catalog.substring(
    auth_proof_private.empty_state_group(6),1,21
  ) || auth_proof_private.u32(1) ||
  auth_proof_private.u8(6) ||
  auth_proof_private.u32(pg_catalog.octet_length(v_row)) || v_row;
  PERFORM auth_proof_private.assert_state_group(6,v_group);
  RETURN v_group;
END;
$$;

CREATE FUNCTION auth_proof_private.assert_a01_password_version(
  p_user_id uuid, p_verified_phc_digest bytea
) RETURNS void LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
BEGIN
  IF p_user_id IS NULL OR p_verified_phc_digest IS NULL OR
    pg_catalog.octet_length(p_verified_phc_digest) <> 32 OR
    NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p_user_id AND u.status = 'ACTIVE'
        AND u.password_hash IS NOT NULL
        AND pg_catalog.sha256(
          pg_catalog.convert_to(u.password_hash,'UTF8')
        ) = p_verified_phc_digest
    )
  THEN
    RAISE EXCEPTION 'VAP1_A01_PASSWORD_VERSION_STALE'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION auth_proof_private.a01_payload_v1(
  p_operation_id uuid,p_user_id uuid,p_verified_phc_digest bytea,
  p_new_session_id uuid, p_new_refresh_id uuid,
  p_new_access_hash text, p_new_refresh_hash text,
  p_limiter_reservation_id uuid
) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $$
DECLARE v_fields bytea;
BEGIN
  IF p_operation_id IS NULL OR p_user_id IS NULL
    OR p_verified_phc_digest IS NULL OR
    pg_catalog.octet_length(p_verified_phc_digest) <> 32 OR
    p_new_session_id IS NULL OR p_new_refresh_id IS NULL OR
    p_limiter_reservation_id IS NULL OR
    p_new_session_id = p_new_refresh_id OR
    p_new_access_hash IS NULL OR
    p_new_access_hash !~ '^staff-access-sha256:v1:[0-9a-f]{64}$' OR
    p_new_refresh_hash IS NULL OR
    p_new_refresh_hash !~ '^staff-refresh-sha256:v1:[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'VAP1_A01_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  v_fields :=
    auth_proof_private.tlv_field(1,2,auth_proof_private.u32(1)) ||
    auth_proof_private.tlv_field(2,5,pg_catalog.uuid_send(p_operation_id)) ||
    auth_proof_private.tlv_field(3,4,pg_catalog.convert_to(
      'STAFF_LOGIN_COMMIT','UTF8')) ||
    auth_proof_private.tlv_field(4,5,pg_catalog.uuid_send(p_user_id)) ||
    auth_proof_private.tlv_field(5,7,p_verified_phc_digest) ||
    auth_proof_private.tlv_field(6,5,pg_catalog.uuid_send(p_new_session_id)) ||
    auth_proof_private.tlv_field(7,5,pg_catalog.uuid_send(p_new_refresh_id)) ||
    auth_proof_private.tlv_field(8,4,pg_catalog.convert_to(
      p_new_access_hash,'UTF8')) ||
    auth_proof_private.tlv_field(9,4,pg_catalog.convert_to(
      p_new_refresh_hash,'UTF8')) ||
    auth_proof_private.tlv_field(10,5,pg_catalog.uuid_send(
      p_limiter_reservation_id));
  RETURN auth_proof_private.tlv_frame(1,10,v_fields);
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.user_state_row_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.user_state_group_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_a01_password_version(uuid,bytea)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.a01_payload_v1(
  uuid,uuid,bytea,uuid,uuid,text,text,uuid
) FROM PUBLIC;
RESET ROLE;
COMMIT;

-- Issue #416 S1: binary VAP1 proof bytes, constructed only in private SQL.
-- No generic runtime-callable signer, encoder or MAC oracle is created.
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.u8(p_value integer)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
BEGIN
  IF p_value NOT BETWEEN 0 AND 255 THEN
    RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.set_byte('\x00'::bytea, 0, p_value);
END;
$$;

CREATE FUNCTION auth_proof_private.u16(p_value integer)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE v_bytes bytea := '\x0000'::bytea;
BEGIN
  IF p_value NOT BETWEEN 0 AND 65535 THEN
    RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
  END IF;
  v_bytes := pg_catalog.set_byte(v_bytes, 0, p_value / 256);
  RETURN pg_catalog.set_byte(v_bytes, 1, p_value % 256);
END;
$$;

CREATE FUNCTION auth_proof_private.u32(p_value numeric)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_bytes bytea := '\x00000000'::bytea;
  v_remaining numeric := p_value;
  v_index integer;
BEGIN
  IF p_value < 0 OR p_value > 4294967295
     OR p_value <> pg_catalog.trunc(p_value) THEN
    RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
  END IF;
  FOR v_index IN REVERSE 3..0 LOOP
    v_bytes := pg_catalog.set_byte(
      v_bytes, v_index, pg_catalog.mod(v_remaining,256)::integer
    );
    v_remaining := pg_catalog.trunc(v_remaining / 256);
  END LOOP;
  RETURN v_bytes;
END;
$$;

CREATE FUNCTION auth_proof_private.u64(p_value numeric)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_bytes bytea := '\x0000000000000000'::bytea;
  v_remaining numeric := p_value;
  v_index integer;
BEGIN
  IF p_value < 0 OR p_value > 18446744073709551615
     OR p_value <> pg_catalog.trunc(p_value) THEN
    RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
  END IF;
  FOR v_index IN REVERSE 7..0 LOOP
    v_bytes := pg_catalog.set_byte(
      v_bytes, v_index, pg_catalog.mod(v_remaining, 256)::integer
    );
    v_remaining := pg_catalog.trunc(v_remaining / 256);
  END LOOP;
  RETURN v_bytes;
END;
$$;

CREATE FUNCTION auth_proof_private.tlv_field(
  p_id integer, p_wire_type integer, p_value bytea
) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $$
DECLARE v_length integer := pg_catalog.octet_length(p_value);
BEGIN
  IF p_id NOT BETWEEN 1 AND 65535 OR p_wire_type NOT BETWEEN 0 AND 7
     OR p_value IS NULL OR v_length > 32768
     OR (p_wire_type = 0 AND v_length <> 0)
     OR (p_wire_type = 1 AND
       (v_length <> 1 OR p_value NOT IN ('\x00'::bytea,'\x01'::bytea)))
     OR (p_wire_type = 2 AND v_length <> 4)
     OR (p_wire_type = 3 AND v_length <> 8)
     OR (p_wire_type = 5 AND v_length <> 16)
     OR (p_wire_type = 7 AND v_length <> 32)
  THEN
    RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_wire_type = 4 THEN
    IF v_length >= 3 THEN
      IF pg_catalog.substring(p_value FROM 1 FOR 3) = '\xefbbbf'::bytea THEN
        RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
      END IF;
    END IF;
    PERFORM pg_catalog.convert_from(p_value, 'UTF8');
  END IF;
  RETURN auth_proof_private.u16(p_id)
    || auth_proof_private.u8(p_wire_type)
    || auth_proof_private.u32(v_length) || p_value;
END;
$$;

CREATE FUNCTION auth_proof_private.tlv_frame(
  p_kind integer, p_count integer, p_fields bytea
) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $$
BEGIN
  IF p_kind NOT BETWEEN 1 AND 3 OR p_count NOT BETWEEN 1 AND 96
     OR p_fields IS NULL OR pg_catalog.octet_length(p_fields) > 65519 THEN
    RAISE EXCEPTION 'VAP1_ENCODING_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.convert_to('VAYLET/VAP1', 'UTF8') || '\x00'::bytea
    || auth_proof_private.u8(p_kind) || auth_proof_private.u16(1)
    || auth_proof_private.u16(p_count) || p_fields;
END;
$$;

CREATE FUNCTION auth_proof_private.nullable_uuid(p_id integer, p_value uuid)
RETURNS bytea LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog AS $$
  SELECT auth_proof_private.tlv_field(
    p_id,
    CASE WHEN p_value IS NULL THEN 0 ELSE 5 END,
    CASE WHEN p_value IS NULL THEN '\x'::bytea
         ELSE pg_catalog.uuid_send(p_value) END
  );
$$;

CREATE FUNCTION auth_proof_private.proof_bytes(p_challenge_id uuid)
RETURNS bytea LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_record auth_proof_private.proof_challenges%ROWTYPE;
  v_fields bytea;
BEGIN
  SELECT * INTO STRICT v_record
  FROM auth_proof_private.proof_challenges
  WHERE challenge_id = p_challenge_id;

  v_fields :=
    auth_proof_private.tlv_field(1,4,pg_catalog.convert_to('vap1','UTF8')) ||
    auth_proof_private.tlv_field(2,4,pg_catalog.convert_to(v_record.key_id,'UTF8')) ||
    auth_proof_private.tlv_field(3,4,pg_catalog.convert_to(v_record.audience,'UTF8')) ||
    auth_proof_private.tlv_field(4,4,pg_catalog.convert_to(v_record.purpose,'UTF8')) ||
    auth_proof_private.tlv_field(5,5,pg_catalog.uuid_send(v_record.operation_id)) ||
    auth_proof_private.tlv_field(6,6,v_record.nonce) ||
    auth_proof_private.tlv_field(7,2,auth_proof_private.u32(v_record.backend_pid)) ||
    auth_proof_private.tlv_field(8,3,auth_proof_private.u64(v_record.full_xid)) ||
    auth_proof_private.tlv_field(9,4,pg_catalog.convert_to(v_record.actor_kind,'UTF8')) ||
    auth_proof_private.nullable_uuid(10,v_record.actor_user_id) ||
    auth_proof_private.nullable_uuid(11,v_record.actor_session_id) ||
    auth_proof_private.nullable_uuid(12,v_record.organization_id) ||
    auth_proof_private.nullable_uuid(13,v_record.membership_id) ||
    auth_proof_private.nullable_uuid(14,v_record.subject_user_id) ||
    auth_proof_private.tlv_field(15,7,v_record.state_digest) ||
    auth_proof_private.tlv_field(16,7,v_record.payload_digest) ||
    auth_proof_private.tlv_field(17,3,auth_proof_private.u64(v_record.issued_at_ms)) ||
    auth_proof_private.tlv_field(18,3,auth_proof_private.u64(v_record.expires_at_ms));

  RETURN auth_proof_private.tlv_frame(2,18,v_fields);
END;
$$;

-- The private helper checks that hmac(bytea,bytea,text) is an actual member
-- of the installed pgcrypto extension, not a same-named function in a writable
-- schema. Its output cannot be requested by ordinary runtime SQL.
CREATE FUNCTION auth_proof_private.pgcrypto_hmac(
  p_data bytea, p_key bytea
) RETURNS bytea LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_schema text;
  v_mac bytea;
BEGIN
  SELECT n.nspname INTO STRICT v_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_depend d ON d.refobjid = e.oid
    AND d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
    AND d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
    AND d.deptype = 'e'
  JOIN pg_catalog.pg_proc p ON p.oid = d.objid
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE e.extname = 'pgcrypto' AND p.proname = 'hmac'
    AND p.proargtypes = '17 17 25'::pg_catalog.oidvector
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(
        COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))
      ) a WHERE a.grantee <> n.nspowner AND a.privilege_type = 'CREATE'
    );
  EXECUTE pg_catalog.format('SELECT %I.hmac($1,$2,%L)',v_schema,'sha256')
    INTO STRICT v_mac USING p_data, p_key;
  IF pg_catalog.octet_length(v_mac) <> 32 THEN
    RAISE EXCEPTION 'VAP1_CRYPTO_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  RETURN v_mac;
EXCEPTION WHEN no_data_found OR too_many_rows OR undefined_function THEN
  RAISE EXCEPTION 'VAP1_CRYPTO_UNAVAILABLE' USING ERRCODE = '42501';
END;
$$;

CREATE FUNCTION auth_proof_private.pgcrypto_random32()
RETURNS bytea LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog AS $$
DECLARE v_schema text; v_random bytea;
BEGIN
  SELECT n.nspname INTO STRICT v_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_depend d ON d.refobjid = e.oid
    AND d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
    AND d.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
    AND d.deptype = 'e'
  JOIN pg_catalog.pg_proc p ON p.oid = d.objid
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE e.extname = 'pgcrypto' AND p.proname = 'gen_random_bytes'
    AND p.proargtypes = '23'::pg_catalog.oidvector
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(
        COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))
      ) a WHERE a.grantee <> n.nspowner AND a.privilege_type = 'CREATE'
    );
  EXECUTE pg_catalog.format('SELECT %I.gen_random_bytes(32)',v_schema)
    INTO STRICT v_random;
  IF pg_catalog.octet_length(v_random) <> 32 THEN
    RAISE EXCEPTION 'VAP1_CRYPTO_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;
  RETURN v_random;
EXCEPTION WHEN no_data_found OR too_many_rows OR undefined_function THEN
  RAISE EXCEPTION 'VAP1_CRYPTO_UNAVAILABLE' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth_proof_private FROM PUBLIC;
RESET ROLE;

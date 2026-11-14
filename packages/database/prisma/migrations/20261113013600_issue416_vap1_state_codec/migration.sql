-- Issue416 U2: the closed, 20-field VAP1 state TLV *codec*.
-- This does not attest persisted rows or authorize a writer. A future narrow
-- prepare must derive every input group from its own complete locked SQL scope.
-- Private-only helpers have no runtime/PUBLIC EXECUTE grants.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.state_row_wire_types(p_group integer)
RETURNS text LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
  SELECT CASE p_group
    WHEN 5 THEN '4,4,6,4,3,3,7,6?'
    WHEN 6 THEN '5,4,4,7?,7'
    WHEN 7 THEN '5,4,7'
    WHEN 8 THEN '5,1,7'
    WHEN 9 THEN '5,5,5,4,4,3?,7'
    WHEN 10 THEN '5,5,4,1,3?,7'
    WHEN 11 THEN '5,5,5,7'
    WHEN 12 THEN '5,5,7,3,3,3?,5?,3?,3?'
    WHEN 13 THEN '5,5,3,7,3?,5?,3?'
    WHEN 14 THEN '5,5,4,5?,7,3?,3'
    WHEN 15 THEN '5,5,3,2,7,7,3?'
    WHEN 16 THEN '5,5,4,3,7,3,3?,5?'
    WHEN 17 THEN '5,5,5,4,7?,3?'
    WHEN 18 THEN '5,5,5,5,4,3,3?,5?,1'
    WHEN 19 THEN '5,4,7,4,5'
    WHEN 20 THEN '5,7,5,3?'
    ELSE NULL END;
$$;

CREATE FUNCTION auth_proof_private.read_u16(p_bytes bytea, p_offset integer)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
BEGIN
  IF p_offset < 0 OR p_offset + 2 > pg_catalog.octet_length(p_bytes) THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.get_byte(p_bytes,p_offset) * 256
       + pg_catalog.get_byte(p_bytes,p_offset + 1);
END;
$$;

CREATE FUNCTION auth_proof_private.read_u32(p_bytes bytea, p_offset integer)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
BEGIN
  IF p_offset < 0 OR p_offset + 4 > pg_catalog.octet_length(p_bytes) THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.get_byte(p_bytes,p_offset)::bigint * 16777216
       + pg_catalog.get_byte(p_bytes,p_offset + 1)::bigint * 65536
       + pg_catalog.get_byte(p_bytes,p_offset + 2)::bigint * 256
       + pg_catalog.get_byte(p_bytes,p_offset + 3);
END;
$$;

CREATE FUNCTION auth_proof_private.assert_state_row(
  p_group integer, p_row bytea
) RETURNS void LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_types text[];
  v_spec text;
  v_count integer;
  v_offset integer := 4;
  v_id integer;
  v_wire integer;
  v_size bigint;
  v_index integer;
  v_expected integer;
BEGIN
  v_spec := auth_proof_private.state_row_wire_types(p_group);
  IF v_spec IS NULL OR pg_catalog.octet_length(p_row) > 32768
     OR auth_proof_private.read_u16(p_row,0) <> 1 THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  v_types := pg_catalog.string_to_array(v_spec, ',');
  v_count := auth_proof_private.read_u16(p_row,2);
  IF v_count <> pg_catalog.cardinality(v_types) THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  FOR v_index IN 1..v_count LOOP
    v_id := auth_proof_private.read_u16(p_row,v_offset);
    IF v_offset + 7 > pg_catalog.octet_length(p_row) THEN
      RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
    END IF;
    v_wire := pg_catalog.get_byte(p_row,v_offset + 2);
    v_size := auth_proof_private.read_u32(p_row,v_offset + 3);
    v_expected := pg_catalog.replace(v_types[v_index],'?','')::integer;
    IF v_id <> v_index OR v_size > 32768
      OR v_offset + 7 + v_size > pg_catalog.octet_length(p_row)
      OR (v_wire <> v_expected
        AND NOT (v_wire = 0 AND pg_catalog.right(v_types[v_index],1) = '?'))
    THEN
      RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
    END IF;
    -- The shared wire encoder validates UUID/BOOL/U32/U64/SHA256/UTF8
    -- lengths and strict UTF-8; NULL requires zero bytes.
    PERFORM auth_proof_private.tlv_field(v_id,v_wire,
      pg_catalog.substring(p_row, v_offset + 8, v_size::integer));
    v_offset := v_offset + 7 + v_size::integer;
  END LOOP;
  IF v_offset <> pg_catalog.octet_length(p_row) THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- The Node U2 encoder sorts only class-declared non-null key field VALUES.
-- Sorting full serialized records would put TLV length before UTF8 bytes,
-- disagreeing with Node for different-length audience/object-kind strings.
CREATE FUNCTION auth_proof_private.state_row_sort_key(
  p_group integer, p_row bytea
) RETURNS bytea[] LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_indices integer[];
  v_keys bytea[] := ARRAY[]::bytea[];
  v_offset integer := 4;
  v_count integer;
  v_index integer;
  v_wire integer;
  v_length integer;
BEGIN
  PERFORM auth_proof_private.assert_state_row(p_group,p_row);
  v_indices := CASE p_group
    WHEN 5 THEN ARRAY[1,2,3]
    WHEN 6 THEN ARRAY[1]
    WHEN 7 THEN ARRAY[1]
    WHEN 8 THEN ARRAY[1]
    WHEN 9 THEN ARRAY[1,2,3]
    WHEN 10 THEN ARRAY[1,2]
    WHEN 11 THEN ARRAY[1,2,3]
    WHEN 12 THEN ARRAY[1,2]
    WHEN 13 THEN ARRAY[1,2,3]
    WHEN 14 THEN ARRAY[1,2]
    WHEN 15 THEN ARRAY[1,2,3,4]
    WHEN 16 THEN ARRAY[1,2,4]
    WHEN 17 THEN ARRAY[1,2,3]
    WHEN 18 THEN ARRAY[1,2]
    WHEN 19 THEN ARRAY[1]
    WHEN 20 THEN ARRAY[1]
    ELSE NULL END;
  IF v_indices IS NULL THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  v_count := auth_proof_private.read_u16(p_row,2);
  FOR v_index IN 1..v_count LOOP
    v_wire := pg_catalog.get_byte(p_row,v_offset + 2);
    v_length := auth_proof_private.read_u32(p_row,v_offset + 3)::integer;
    IF v_index = ANY(v_indices) THEN
      IF v_wire = 0 THEN
        RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
      END IF;
      v_keys := pg_catalog.array_append(
        v_keys, pg_catalog.substring(p_row,v_offset + 8,v_length));
    END IF;
    v_offset := v_offset + 7 + v_length;
  END LOOP;
  IF pg_catalog.cardinality(v_keys) <> pg_catalog.cardinality(v_indices) THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  RETURN v_keys;
END;
$$;

CREATE FUNCTION auth_proof_private.assert_state_group(
  p_group integer, p_group_bytes bytea
) RETURNS void LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
DECLARE
  v_magic bytea := pg_catalog.convert_to('VAYLET/VAP1/ARRAY','UTF8') || '\x00'::bytea;
  v_count bigint;
  v_offset integer := 25;
  v_wire integer;
  v_size bigint;
  v_index bigint;
  v_row bytea;
  v_prev_key bytea[];
  v_key bytea[];
BEGIN
  IF p_group NOT BETWEEN 5 AND 20
    OR pg_catalog.octet_length(p_group_bytes) < 25
    OR pg_catalog.octet_length(p_group_bytes) > 32768
    OR pg_catalog.substring(p_group_bytes, 1, 18) <> v_magic
    OR auth_proof_private.read_u16(p_group_bytes,18) <> 1
    OR pg_catalog.get_byte(p_group_bytes,20) <> p_group + 11
  THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  v_count := auth_proof_private.read_u32(p_group_bytes,21);
  IF v_count > 512 THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  FOR v_index IN 1..v_count LOOP
    IF v_offset + 5 > pg_catalog.octet_length(p_group_bytes) THEN
      RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
    END IF;
    v_wire := pg_catalog.get_byte(p_group_bytes,v_offset);
    v_size := auth_proof_private.read_u32(p_group_bytes,v_offset + 1);
    IF v_wire <> 6 OR v_size > 32768
       OR v_offset + 5 + v_size > pg_catalog.octet_length(p_group_bytes) THEN
      RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
    END IF;
    v_row := pg_catalog.substring(p_group_bytes,
      v_offset + 6, v_size::integer);
    v_key := auth_proof_private.state_row_sort_key(p_group,v_row);
    -- Compare key VALUES only, in the frozen class-defined order. The
    -- complete SQL-derived row set still needs to be proven by its writer.
    IF v_prev_key IS NOT NULL AND v_key <= v_prev_key THEN
      RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
    END IF;
    v_prev_key := v_key;
    v_offset := v_offset + 5 + v_size::integer;
  END LOOP;
  IF v_offset <> pg_catalog.octet_length(p_group_bytes) THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION auth_proof_private.empty_state_group(p_group integer)
RETURNS bytea LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
BEGIN
  IF p_group NOT BETWEEN 5 AND 20 THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.convert_to('VAYLET/VAP1/ARRAY','UTF8')
    || '\x00'::bytea || auth_proof_private.u16(1)
    || auth_proof_private.u8(p_group + 11) || auth_proof_private.u32(0);
END;
$$;

CREATE FUNCTION auth_proof_private.state_frame_v1(
  p_operation_id uuid, p_purpose text, p_key_epoch bigint, p_groups bytea[]
) RETURNS bytea LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $$
DECLARE v_fields bytea; v_group integer;
BEGIN
  IF p_operation_id IS NULL OR p_purpose IS NULL
     OR p_purpose !~ '^[A-Z][A-Z0-9_]{2,95}$'
     OR p_key_epoch IS NULL OR p_key_epoch <= 0
     OR p_groups IS NULL OR pg_catalog.array_ndims(p_groups) <> 1
     OR pg_catalog.cardinality(p_groups) <> 16
     OR pg_catalog.array_lower(p_groups,1) <> 1 THEN
    RAISE EXCEPTION 'VAP1_STATE_NONCANONICAL' USING ERRCODE = '22023';
  END IF;
  v_fields := auth_proof_private.tlv_field(1,2,auth_proof_private.u32(1))
    || auth_proof_private.tlv_field(2,5,pg_catalog.uuid_send(p_operation_id))
    || auth_proof_private.tlv_field(3,4,pg_catalog.convert_to(p_purpose,'UTF8'))
    || auth_proof_private.tlv_field(4,3,auth_proof_private.u64(p_key_epoch));
  FOR v_group IN 5..20 LOOP
    PERFORM auth_proof_private.assert_state_group(
      v_group,p_groups[v_group - 4]);
    v_fields := v_fields || auth_proof_private.tlv_field(
      v_group,6,p_groups[v_group - 4]);
  END LOOP;
  RETURN auth_proof_private.tlv_frame(3,20,v_fields);
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.state_row_wire_types(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.read_u16(bytea,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.read_u32(bytea,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_state_row(integer,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.state_row_sort_key(integer,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.assert_state_group(integer,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.empty_state_group(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_proof_private.state_frame_v1(uuid,text,bigint,bytea[]) FROM PUBLIC;
RESET ROLE;
COMMIT;

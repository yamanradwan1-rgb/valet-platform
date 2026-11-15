-- R02 U2 ABI: only the four PRIVATE reservation UUIDs from migration120/124.
-- The public limiter_bindings FK intentionally points to public events and
-- MUST NOT be reused for R02. This private invoker receives no runtime grant.
BEGIN;
SET ROLE vap1_proof_owner;

CREATE FUNCTION auth_proof_private.assert_reset_issue_reservations(
  p_audience text, p_operation_id uuid, p_request_fingerprint bytea,
  p_issuer_user_id uuid, p_issuer_membership_id uuid,
  p_target_user_id uuid, p_target_membership_id uuid,
  p_organization_id uuid,
  p_reservation_ids uuid[]
) RETURNS TABLE (
  scope text, reservation_id uuid, key_digest bytea,
  reservation_state text, bound_operation_id uuid
) LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $$
DECLARE
  v_bundle auth_proof_private.reset_issue_quota_bundles%ROWTYPE;
  v_entry auth_proof_private.reset_issue_quota_entries%ROWTYPE;
  v_expected_scope text;
  v_expected_hash text;
  v_index integer;
BEGIN
  IF p_audience IS NULL OR p_operation_id IS NULL
    OR p_request_fingerprint IS NULL
    OR pg_catalog.octet_length(p_request_fingerprint) <> 32
    OR p_reservation_ids IS NULL
    OR pg_catalog.coalesce(pg_catalog.array_ndims(p_reservation_ids),0) <> 1
    OR pg_catalog.coalesce(pg_catalog.cardinality(p_reservation_ids),0) <> 4
    OR pg_catalog.array_lower(p_reservation_ids,1) <> 1
  THEN
    RAISE EXCEPTION 'VAP1_RESET_RESERVATIONS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_bundle
  FROM auth_proof_private.reset_issue_quota_bundles b
  WHERE b.audience = p_audience AND b.operation_id = p_operation_id
  FOR SHARE;
  IF NOT FOUND OR v_bundle.state <> 'PENDING'
    OR v_bundle.request_fingerprint IS DISTINCT FROM p_request_fingerprint
    OR v_bundle.issuer_user_id IS DISTINCT FROM p_issuer_user_id
    OR v_bundle.issuer_membership_id IS DISTINCT FROM p_issuer_membership_id
    OR v_bundle.target_user_id IS DISTINCT FROM p_target_user_id
    OR v_bundle.target_membership_id IS DISTINCT FROM p_target_membership_id
    OR v_bundle.organization_id IS DISTINCT FROM p_organization_id
    OR v_bundle.reserved_at + INTERVAL '15 minutes'
      <= pg_catalog.clock_timestamp()
  THEN
    RAISE EXCEPTION 'VAP1_RESET_RESERVATIONS_DENIED' USING ERRCODE = '42501';
  END IF;
  -- The canonical R02 order is target, issuer, Organization, client-address.
  -- The caller cannot select a subset, reorder scopes or substitute public IDs.
  FOR v_index IN 1..4 LOOP
    v_expected_scope := CASE v_index
      WHEN 1 THEN 'v1:staff-password-reset-issue-target-user'
      WHEN 2 THEN 'v1:staff-password-reset-issue-issuer-user'
      WHEN 3 THEN 'v1:staff-password-reset-issue-organization'
      ELSE 'v1:staff-password-reset-issue-client-address'
    END;
    v_expected_hash := CASE v_index
      WHEN 1 THEN v_bundle.target_hash
      WHEN 2 THEN v_bundle.issuer_hash
      WHEN 3 THEN v_bundle.organization_hash
      ELSE v_bundle.client_address_hash
    END;
    SELECT * INTO v_entry
    FROM auth_proof_private.reset_issue_quota_entries e
    WHERE e.reservation_id = p_reservation_ids[v_index]
    FOR SHARE;
    IF NOT FOUND OR v_entry.audience IS DISTINCT FROM p_audience
      OR v_entry.operation_id IS DISTINCT FROM p_operation_id
      OR v_entry.scope IS DISTINCT FROM v_expected_scope
      OR v_entry.key_hash IS DISTINCT FROM v_expected_hash
      OR v_entry.state IS DISTINCT FROM 'PENDING'
      OR v_entry.occurred_at IS DISTINCT FROM v_bundle.reserved_at
      OR v_entry.key_digest IS DISTINCT FROM pg_catalog.decode(
        pg_catalog.split_part(v_expected_hash,':',3), 'hex'
      )
    THEN
      RAISE EXCEPTION 'VAP1_RESET_RESERVATIONS_DENIED' USING ERRCODE = '42501';
    END IF;
    scope := v_entry.scope;
    reservation_id := v_entry.reservation_id;
    key_digest := v_entry.key_digest;
    reservation_state := v_entry.state;
    bound_operation_id := v_entry.operation_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION auth_proof_private.assert_reset_issue_reservations(
  text,uuid,bytea,uuid,uuid,uuid,uuid,uuid,uuid[]
) FROM PUBLIC;
RESET ROLE;
COMMIT;

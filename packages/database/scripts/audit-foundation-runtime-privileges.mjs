export async function provisionAuditFoundationPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE ALL ON TABLE account_security_audit_events FROM PUBLIC`,
  );
  await client.query(
    `REVOKE SELECT (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ), INSERT (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ), UPDATE (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ), REFERENCES (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ) ON TABLE account_security_audit_events FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE account_security_audit_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    `REVOKE SELECT (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ), INSERT (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ), UPDATE (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ), REFERENCES (
       id, event_type, subject_user_id, actor_type, actor_user_id,
       controlled_operator_ref, occurred_at, created_at
     ) ON TABLE account_security_audit_events FROM %I`,
    [runtimeRole],
  );
  await client.query(
    `REVOKE ALL ON FUNCTION append_account_security_audit_event(
       uuid, text, uuid, account_security_actor_type, uuid, text, timestamptz
     ) FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON FUNCTION append_account_security_audit_event(uuid, text, uuid, account_security_actor_type, uuid, text, timestamptz) FROM %I",
    [runtimeRole],
  );
  await client.query(
    `REVOKE ALL ON FUNCTION append_runtime_account_security_audit_event(
       uuid, text, uuid, account_security_actor_type, uuid, timestamptz
     ) FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON FUNCTION append_runtime_account_security_audit_event(uuid, text, uuid, account_security_actor_type, uuid, timestamptz) FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT EXECUTE ON FUNCTION append_runtime_account_security_audit_event(uuid, text, uuid, account_security_actor_type, uuid, timestamptz) TO %I",
    [runtimeRole],
  );
}

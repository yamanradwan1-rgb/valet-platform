export const accountSecurityAuditAppendFunction =
  "public.append_account_security_audit_event_exact(uuid,uuid,account_security_actor_type,uuid,text,text,text,text,timestamp with time zone)";

export async function provisionAppendOnlyTablePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE audit_events, condition_notes, vehicle_photos, intake_operations, key_custody_events, dispatch_events, raw_gps_samples, geofence_events FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_events, condition_notes, vehicle_photos, intake_operations, key_custody_events, dispatch_events, raw_gps_samples, geofence_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE audit_events, condition_notes, vehicle_photos, intake_operations, key_custody_events, dispatch_events, raw_gps_samples, geofence_events TO %I",
    [runtimeRole],
  );
  await client.query(
    `REVOKE INSERT, SELECT, UPDATE, DELETE, TRUNCATE ON TABLE account_security_audit_events FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON TABLE account_security_audit_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT INSERT ON TABLE account_security_audit_events TO %I",
    [runtimeRole],
  );
  await client.query(
    `REVOKE ALL ON FUNCTION ${accountSecurityAuditAppendFunction} FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    `GRANT EXECUTE ON FUNCTION ${accountSecurityAuditAppendFunction} TO %I`,
    [runtimeRole],
  );
}

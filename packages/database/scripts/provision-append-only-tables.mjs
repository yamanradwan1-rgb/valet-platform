export async function provisionAppendOnlyTablePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE audit_events, condition_notes, vehicle_photos, intake_operations, key_custody_events FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_events, condition_notes, vehicle_photos, intake_operations, key_custody_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE audit_events, condition_notes, vehicle_photos, intake_operations, key_custody_events TO %I",
    [runtimeRole],
  );
}

import { provisionAuditFoundationPrivileges } from "./audit-foundation-runtime-privileges.mjs";

export async function provisionAppendOnlyTablePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(`REVOKE ALL ON TABLE audit_events FROM PUBLIC`);
  await client.query(
    `REVOKE SELECT (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ), INSERT (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ), UPDATE (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ), REFERENCES (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ) ON TABLE audit_events FROM PUBLIC`,
  );
  await executeFormatted(client, "REVOKE ALL ON TABLE audit_events FROM %I", [
    runtimeRole,
  ]);
  await executeFormatted(
    client,
    `REVOKE SELECT (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ), INSERT (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ), UPDATE (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ), REFERENCES (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type, controlled_operator_ref,
       event_type, entity_type, entity_id, metadata_json, idempotency_key,
       occurred_at, created_at
     ) ON TABLE audit_events FROM %I`,
    [runtimeRole],
  );
  await executeFormatted(client, "GRANT SELECT ON TABLE audit_events TO %I", [
    runtimeRole,
  ]);
  for (const column of [
    "id",
    "organization_id",
    "location_id",
    "valet_session_id",
    "actor_membership_id",
    "actor_type",
    "event_type",
    "entity_type",
    "entity_id",
    "metadata_json",
    "idempotency_key",
    "occurred_at",
  ]) {
    await executeFormatted(
      client,
      "GRANT INSERT (%I) ON TABLE audit_events TO %I",
      [column, runtimeRole],
    );
  }
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE condition_notes, vehicle_photos, intake_operations, key_custody_events, dispatch_events, raw_gps_samples, geofence_events FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE condition_notes, vehicle_photos, intake_operations, key_custody_events, dispatch_events, raw_gps_samples, geofence_events FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE condition_notes, vehicle_photos, intake_operations, key_custody_events, dispatch_events, raw_gps_samples, geofence_events TO %I",
    [runtimeRole],
  );
  // Issue #352: a committed emergency takeover receipt can be inserted/read,
  // never edited, deleted, truncated, referenced or used to create triggers.
  await client.query(
    "REVOKE ALL ON TABLE emergency_task_takeover_operations FROM PUBLIC",
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE emergency_task_takeover_operations FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE emergency_task_takeover_operations TO %I",
    [runtimeRole],
  );
  await provisionAuditFoundationPrivileges(client, executeFormatted, runtimeRole);
}

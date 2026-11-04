import { anyColumnPrivilegeMatches, tablePrivilegeMatches } from "./runtime-privilege-verification-helpers.mjs";

const table = "public.management_alert_seen_receipts";

/** No UPDATE/DELETE: per-user Seen is append-once and must survive retries. */
export async function provisionManagementAlertSeenPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await executeFormatted(client, "GRANT SELECT ON TABLE %s TO %I", [
    table,
    runtimeRole,
  ]);
  for (const column of [
    "organization_id",
    "user_id",
    "category",
    "source_id",
    "takeover_operation_id",
    "occurrence_audit_event_id",
    "geofence_event_id",
  ]) {
    await executeFormatted(client, "GRANT INSERT (%I) ON TABLE %s TO %I", [
      column,
      table,
      runtimeRole,
    ]);
  }
}

export async function verifyManagementAlertSeenPrivileges(client, runtimeRole) {
  for (const [privilege, expected] of [
    ["SELECT", true],
    ["INSERT", false],
    ["UPDATE", false],
    ["DELETE", false],
    ["TRUNCATE", false],
    ["REFERENCES", false],
    ["TRIGGER", false],
  ]) {
    if (!(await tablePrivilegeMatches(client, runtimeRole, [
      table, privilege, expected,
    ]))) {
      throw new Error(`Management Alert Seen ${privilege} privileges unsafe.`);
    }
  }
  if (!(await anyColumnPrivilegeMatches(client, runtimeRole, [
    table, "INSERT", true,
  ]))) {
    throw new Error("Management Alert Seen INSERT privileges missing.");
  }
  const checks = await client.query(
    `SELECT has_any_column_privilege($1,$2,'UPDATE,REFERENCES') AS unsafe,
            has_column_privilege($1,$2,'seen_at','INSERT') AS fake_time`,
    [runtimeRole, table],
  );
  if (checks.rows[0]?.unsafe !== false || checks.rows[0]?.fake_time !== false) {
    throw new Error("Management Alert Seen column privileges unsafe.");
  }
  for (const column of [
    "organization_id", "user_id", "category", "source_id",
    "takeover_operation_id", "occurrence_audit_event_id", "geofence_event_id",
  ]) {
    const columnGrant = await client.query(
      `SELECT has_column_privilege($1,$2,$3,'INSERT') AS allowed`,
      [runtimeRole, table, column],
    );
    if (columnGrant.rows[0]?.allowed !== true) {
      throw new Error("Management Alert Seen source INSERT privilege missing.");
    }
  }
}

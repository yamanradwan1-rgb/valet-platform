import {
  anyColumnPrivilegeMatches,
  columnPrivilegeMatches,
  tablePrivilegeMatches,
} from "./runtime-privilege-verification-helpers.mjs";

const table = "public.management_alert_timing_preferences";
const values = [
  "alt01_grace_seconds",
  "alt02_queue_seconds",
  "alt03_decline_seconds",
  "alt04_stage_seconds",
  "alt06_handoff_seconds",
  "alt11_unknown_payment_seconds",
];

export async function provisionManagementAlertTimingPrivileges(
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
    ...values,
    "revision",
    "updated_at",
  ]) {
    await executeFormatted(client, "GRANT INSERT (%I) ON TABLE %s TO %I", [
      column,
      table,
      runtimeRole,
    ]);
  }
  for (const column of [...values, "revision", "updated_at"]) {
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE %s TO %I", [
      column,
      table,
      runtimeRole,
    ]);
  }
}

export async function verifyManagementAlertTimingPrivileges(
  client,
  runtimeRole,
) {
  const tableChecks = [
    [table, "SELECT", true],
    [table, "DELETE", false],
    [table, "TRUNCATE", false],
    [table, "REFERENCES", false],
    [table, "TRIGGER", false],
  ];
  for (const policy of tableChecks) {
    if (!(await tablePrivilegeMatches(client, runtimeRole, policy))) {
      throw new Error("Management Alert timing table privileges are unsafe.");
    }
  }
  for (const policy of [
    [table, "INSERT", true],
    [table, "UPDATE", true],
  ]) {
    if (!(await anyColumnPrivilegeMatches(client, runtimeRole, policy))) {
      throw new Error("Management Alert timing column privileges are missing.");
    }
  }
  for (const column of [
    "organization_id",
    "user_id",
    ...values,
    "revision",
    "updated_at",
  ]) {
    const allowed = column !== "organization_id" && column !== "user_id";
    if (
      !(await columnPrivilegeMatches(client, runtimeRole, [
        table,
        column,
        allowed,
      ]))
    ) {
      throw new Error("Management Alert timing UPDATE privileges are unsafe.");
    }
    const inserted = await client.query(
      "SELECT has_column_privilege($1, $2, $3, 'INSERT') AS allowed",
      [runtimeRole, table, column],
    );
    if (inserted.rows[0]?.allowed !== true) {
      throw new Error("Management Alert timing INSERT privileges are unsafe.");
    }
  }
}

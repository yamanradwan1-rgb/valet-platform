const runtimeReadOnlyTables = [
  "organizations",
  "locations",
  "users",
  "organization_memberships",
  "membership_location_access",
  "parking_zones",
  "parking_spots",
  "key_slots",
];

const runtimeInsertOnlyTables = ["customers"];

const runtimeOperationalTables = [
  "vehicles",
  "valet_sessions",
  "shifts",
  "tasks",
];

const runtimeLockColumns = [
  ["users", "last_login_at"],
  ["users", "updated_at"],
  ["organizations", "updated_at"],
  ["locations", "updated_at"],
  ["organization_memberships", "updated_at"],
  ["membership_location_access", "created_at"],
  ["key_slots", "updated_at"],
  ["parking_spots", "updated_at"],
  ["parking_zones", "updated_at"],
];

export async function provisionRuntimeTablePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const table of runtimeReadOnlyTables) {
    await executeFormatted(client, "GRANT SELECT ON TABLE %I TO %I", [
      table,
      runtimeRole,
    ]);
  }
  for (const table of runtimeInsertOnlyTables) {
    await executeFormatted(client, "GRANT SELECT, INSERT ON TABLE %I TO %I", [
      table,
      runtimeRole,
    ]);
  }
  for (const table of runtimeOperationalTables) {
    await executeFormatted(
      client,
      "GRANT SELECT, INSERT, UPDATE ON TABLE %I TO %I",
      [table, runtimeRole],
    );
  }
  for (const [table, column] of runtimeLockColumns) {
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE %I TO %I", [
      column,
      table,
      runtimeRole,
    ]);
  }
}

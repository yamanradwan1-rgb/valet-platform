export const incidentReadPolicies = [
  ["public.incidents", "SELECT", true],
  ["public.incidents", "INSERT", true],
  ["public.incidents", "UPDATE", false],
  ["public.incidents", "DELETE", false],
  ["public.incidents", "TRUNCATE", false],
  ["public.incidents", "REFERENCES", false],
  ["public.incidents", "TRIGGER", false],
];

export const incidentRecoveryPrivileges = {
  anyColumn: [
    ["public.incident_recovery_intents", "INSERT", true],
    ["public.incident_recovery_intents", "UPDATE", true],
  ],
  column: [
    ["public.incident_recovery_intents", "state", true],
    ["public.incident_recovery_intents", "retired_at", false],
    ["public.incident_recovery_intents", "incident_id", false],
    ["public.incident_recovery_intents", "organization_id", false],
    ["public.incident_recovery_intents", "location_id", false],
    ["public.incident_recovery_intents", "valet_session_id", false],
    ["public.incident_recovery_intents", "reporting_membership_id", false],
    ["public.incident_recovery_intents", "created_at", false],
    ["public.incident_recovery_intents", "expires_at", false],
  ],
  table: [
    ["public.incident_recovery_intents", "SELECT", true],
    ["public.incident_recovery_intents", "INSERT", false],
    ["public.incident_recovery_intents", "UPDATE", false],
    ["public.incident_recovery_intents", "DELETE", false],
    ["public.incident_recovery_intents", "TRUNCATE", false],
    ["public.incident_recovery_intents", "REFERENCES", false],
    ["public.incident_recovery_intents", "TRIGGER", false],
  ],
};

const insertColumns = [
  "incident_id",
  "organization_id",
  "location_id",
  "valet_session_id",
  "reporting_membership_id",
];

export async function verifyIncidentRecoveryPrivileges(client, runtimeRole) {
  const columns = [
    "incident_id",
    "organization_id",
    "location_id",
    "valet_session_id",
    "reporting_membership_id",
    "state",
    "created_at",
    "expires_at",
    "retired_at",
  ];
  for (const column of columns) {
    const result = await client.query(
      `SELECT has_column_privilege($1, 'public.incident_recovery_intents',
                                   $2, 'INSERT') AS can_insert,
              has_column_privilege($1, 'public.incident_recovery_intents',
                                   $2, 'UPDATE') AS can_update`,
      [runtimeRole, column],
    );
    if (
      result.rows[0]?.can_insert !== insertColumns.includes(column) ||
      result.rows[0]?.can_update !== (column === "state")
    ) {
      throw new Error("Runtime Incident recovery privileges are unsafe.");
    }
  }
}

export async function provisionIncidentRecoveryPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE ALL ON TABLE incident_recovery_intents FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE incident_recovery_intents FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT ON TABLE incident_recovery_intents TO %I",
    [runtimeRole],
  );
  for (const column of insertColumns) {
    await executeFormatted(
      client,
      "GRANT INSERT (%I) ON TABLE incident_recovery_intents TO %I",
      [column, runtimeRole],
    );
  }
  await executeFormatted(
    client,
    "GRANT UPDATE (state) ON TABLE incident_recovery_intents TO %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON FUNCTION incident_recovery_intent_guard() FROM %I",
    [runtimeRole],
  );
}

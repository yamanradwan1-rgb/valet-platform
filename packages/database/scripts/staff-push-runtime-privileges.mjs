const registrationTable = "public.staff_push_registrations";
const intentTable = "public.staff_push_intents";
const deliveryTable = "public.staff_push_deliveries";

const registrationUpdateColumns = [
  "provider_token",
  "app_version",
  "app_build",
  "locale",
  "state",
  "last_confirmed_at",
  "terminal_at",
  "terminal_reason_class",
  "superseded_by_registration_id",
  "updated_at",
];

const deliveryUpdateColumns = [
  "state",
  "attempt_count",
  "next_attempt_at",
  "lease_token",
  "lease_expires_at",
  "provider_result_class",
  "provider_reference",
  "provider_accepted_at",
  "terminal_at",
  "updated_at",
];

export const staffPushPrivileges = {
  anyColumn: [
    [registrationTable, "UPDATE", true],
    [intentTable, "UPDATE", false],
    [deliveryTable, "UPDATE", true],
  ],
  column: [
    ...registrationUpdateColumns.map((column) => [
      registrationTable,
      column,
      true,
    ]),
    [registrationTable, "token_hash", false],
    [registrationTable, "staff_auth_session_id", false],
    ...deliveryUpdateColumns.map((column) => [deliveryTable, column, true]),
    [deliveryTable, "organization_id", false],
    [deliveryTable, "intent_id", false],
    [deliveryTable, "registration_id", false],
    [deliveryTable, "recipient_membership_id", false],
    [deliveryTable, "max_attempts", false],
  ],
  table: [
    ...[registrationTable, intentTable, deliveryTable].flatMap((table) => [
      [table, "SELECT", true],
      [table, "INSERT", true],
      [table, "UPDATE", false],
      [table, "DELETE", false],
      [table, "TRUNCATE", false],
      [table, "REFERENCES", false],
      [table, "TRIGGER", false],
    ]),
  ],
};

export async function provisionStaffPushPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE ALL ON TABLE staff_push_registrations,
                         staff_push_intents,
                         staff_push_deliveries FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE staff_push_registrations, staff_push_intents, staff_push_deliveries TO %I",
    [runtimeRole],
  );
  for (const column of registrationUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE staff_push_registrations TO %I",
      [column, runtimeRole],
    );
  }
  for (const column of deliveryUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE staff_push_deliveries TO %I",
      [column, runtimeRole],
    );
  }
}

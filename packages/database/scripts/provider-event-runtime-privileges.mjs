export const providerEventTablePrivileges = [
  ["public.payment_provider_events", "SELECT", true],
  ["public.payment_provider_events", "INSERT", true],
  ["public.payment_provider_events", "UPDATE", false],
  ["public.payment_provider_events", "DELETE", false],
  ["public.payment_provider_events", "TRUNCATE", false],
  ["public.payment_provider_events", "REFERENCES", false],
  ["public.payment_provider_events", "TRIGGER", false],
  ["public.refunds", "SELECT", true],
  ["public.refunds", "INSERT", false],
  ["public.refunds", "UPDATE", false],
  ["public.refunds", "DELETE", false],
  ["public.refunds", "TRUNCATE", false],
  ["public.refunds", "REFERENCES", false],
  ["public.refunds", "TRIGGER", false],
];

const refundMutableColumns = ["status", "provider_reference", "completed_at"];
const refundImmutableColumns = [
  "id",
  "organization_id",
  "payment_id",
  "amount",
  "reason",
  "authorized_by_membership_id",
  "idempotency_key",
  "provider",
  "requested_at",
  "created_at",
];

export const providerEventColumnPrivileges = [
  ...refundMutableColumns.map((column) => ["public.refunds", column, true]),
  ...refundImmutableColumns.map((column) => ["public.refunds", column, false]),
];

export const providerEventAnyColumnPrivileges = [
  ["public.payment_provider_events", "UPDATE", false],
  ["public.refunds", "UPDATE", true],
  ["public.refunds", "INSERT", false],
];

export const providerEventPrivileges = {
  anyColumn: providerEventAnyColumnPrivileges,
  column: providerEventColumnPrivileges,
  table: providerEventTablePrivileges,
};

export async function provisionProviderEventPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  for (const table of ["payment_provider_events", "refunds"]) {
    await client.query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
    await executeFormatted(client, "REVOKE ALL ON TABLE %I FROM %I", [
      table,
      runtimeRole,
    ]);
  }
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE payment_provider_events TO %I",
    [runtimeRole],
  );
  await executeFormatted(client, "GRANT SELECT ON TABLE refunds TO %I", [
    runtimeRole,
  ]);
  for (const column of refundMutableColumns) {
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE refunds TO %I", [
      column,
      runtimeRole,
    ]);
  }
}

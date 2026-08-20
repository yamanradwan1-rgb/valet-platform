export const paymentCollectionTablePrivileges = [
  ["public.payment_collection_operations", "SELECT", true],
  ["public.payment_collection_operations", "INSERT", true],
  ["public.payment_collection_operations", "UPDATE", false],
  ["public.payment_collection_operations", "DELETE", false],
  ["public.payment_collection_operations", "TRUNCATE", false],
  ["public.payment_collection_operations", "REFERENCES", false],
  ["public.payment_collection_operations", "TRIGGER", false],
];

export const paymentCollectionColumnPrivileges = [
  ["public.payment_collection_operations", "id", false],
  ["public.payment_collection_operations", "organization_id", false],
  ["public.payment_collection_operations", "payment_id", false],
  ["public.payment_collection_operations", "submission_idempotency_key", false],
  ["public.payment_collection_operations", "amount", false],
  ["public.payment_collection_operations", "currency", false],
  ["public.payment_collection_operations", "provider", false],
  ["public.payment_collection_operations", "created_at", false],
  ["public.payment_collection_operations", "state", true],
  ["public.payment_collection_operations", "provider_reference", true],
  ["public.payment_collection_operations", "safe_result_code", true],
  ["public.payment_collection_operations", "dispatch_guarded_at", true],
  ["public.payment_collection_operations", "resolved_at", true],
  ["public.payment_collection_operations", "updated_at", true],
];

export const paymentCollectionAnyColumnPrivileges = [
  ["public.payment_collection_operations", "UPDATE", true],
];

export const paymentCollectionPrivileges = {
  anyColumn: paymentCollectionAnyColumnPrivileges,
  column: paymentCollectionColumnPrivileges,
  table: paymentCollectionTablePrivileges,
};

const mutableColumns = [
  "state",
  "provider_reference",
  "safe_result_code",
  "dispatch_guarded_at",
  "resolved_at",
  "updated_at",
];

export async function provisionPaymentCollectionPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    "REVOKE ALL ON TABLE payment_collection_operations FROM PUBLIC",
  );
  await executeFormatted(
    client,
    "REVOKE ALL ON TABLE payment_collection_operations FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE payment_collection_operations TO %I",
    [runtimeRole],
  );
  for (const column of mutableColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE payment_collection_operations TO %I",
      [column, runtimeRole],
    );
  }
}

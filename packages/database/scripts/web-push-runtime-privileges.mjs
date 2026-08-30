export const webPushSubscriptionUpdateColumns = [
  "endpoint_fingerprint",
  "endpoint_ciphertext",
  "p256dh_ciphertext",
  "auth_ciphertext",
  "encryption_key_version",
  "browser_expires_at",
  "locale",
  "disabled_at",
  "disabled_reason",
  "updated_at",
];

export const webPushDeliveryUpdateColumns = [
  "status",
  "attempt_count",
  "next_attempt_at",
  "lease_token",
  "lease_expires_at",
  "accepted_at",
  "terminal_at",
  "suppressed_at",
  "last_failure_class",
  "updated_at",
];

export const webPushTablePrivileges = [
  ["public.web_push_subscriptions", "SELECT", true],
  ["public.web_push_subscriptions", "INSERT", true],
  ["public.web_push_subscriptions", "UPDATE", false],
  ["public.web_push_subscriptions", "DELETE", false],
  ["public.web_push_subscriptions", "TRUNCATE", false],
  ["public.web_push_delivery_intents", "SELECT", true],
  ["public.web_push_delivery_intents", "INSERT", true],
  ["public.web_push_delivery_intents", "UPDATE", false],
  ["public.web_push_delivery_intents", "DELETE", false],
  ["public.web_push_delivery_intents", "TRUNCATE", false],
  ["public.web_push_deliveries", "SELECT", true],
  ["public.web_push_deliveries", "INSERT", true],
  ["public.web_push_deliveries", "UPDATE", false],
  ["public.web_push_deliveries", "DELETE", false],
  ["public.web_push_deliveries", "TRUNCATE", false],
];

export const webPushAnyColumnPrivileges = [
  ["public.web_push_subscriptions", "UPDATE", true],
  ["public.web_push_delivery_intents", "UPDATE", false],
  ["public.web_push_deliveries", "UPDATE", true],
];

export const webPushColumnPrivileges = [
  ...webPushSubscriptionUpdateColumns.map((column) => [
    "public.web_push_subscriptions",
    column,
    true,
  ]),
  ["public.web_push_subscriptions", "staff_auth_session_id", false],
  ["public.web_push_subscriptions", "guest_valet_session_id", false],
  ["public.web_push_subscriptions", "guest_access_generation", false],
  ...webPushDeliveryUpdateColumns.map((column) => [
    "public.web_push_deliveries",
    column,
    true,
  ]),
  ["public.web_push_deliveries", "intent_id", false],
  ["public.web_push_deliveries", "push_subscription_id", false],
];

export async function provisionWebPushPrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  const tables = [
    "web_push_subscriptions",
    "web_push_delivery_intents",
    "web_push_deliveries",
  ];
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
     web_push_subscriptions, web_push_delivery_intents, web_push_deliveries
     FROM PUBLIC`,
  );
  for (const table of tables) {
    await executeFormatted(
      client,
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE %I FROM %I",
      [table, runtimeRole],
    );
    await executeFormatted(client, "GRANT SELECT, INSERT ON TABLE %I TO %I", [
      table,
      runtimeRole,
    ]);
  }
  for (const column of webPushSubscriptionUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE web_push_subscriptions TO %I",
      [column, runtimeRole],
    );
  }
  for (const column of webPushDeliveryUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE web_push_deliveries TO %I",
      [column, runtimeRole],
    );
  }
}

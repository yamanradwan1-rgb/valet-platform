import { provisionPaymentCollectionPrivileges } from "./payment-collection-runtime-privileges.mjs";
import { provisionProviderEventPrivileges } from "./provider-event-runtime-privileges.mjs";
import { provisionLocationConfigurationPrivileges } from "./location-configuration-runtime-privileges.mjs";
import {
  organizationSubscriptionTablePolicies,
  provisionBasicBrandingPrivileges,
} from "./basic-branding-runtime-privileges.mjs";
import { provisionStaffPushPrivileges } from "./staff-push-runtime-privileges.mjs";

const runtimeReadOnlyTables = [
  "organizations",
  "locations",
  "users",
  "organization_memberships",
  "membership_location_access",
  "parking_zones",
  "parking_spots",
  "key_slots",
  "incidents",
  "location_map_points",
  "location_map_areas",
  "location_map_area_vertices",
];

const runtimeInsertOnlyTables = ["customers", "payments", "incidents"];

export const customerPrivileges = {
  anyColumn: [["public.customers", "UPDATE", false]],
  table: [
    ["public.customers", "SELECT", true],
    ["public.customers", "INSERT", true],
    ["public.customers", "UPDATE", false],
    ["public.customers", "DELETE", false],
    ["public.customers", "TRUNCATE", false],
    ["public.customers", "REFERENCES", false],
    ["public.customers", "TRIGGER", false],
  ],
};

const runtimeOperationalTables = [
  "vehicles",
  "valet_sessions",
  "tasks",
  "retrieval_requests",
  "handoff_verifications",
];

const runtimeTrackingSessionTables = ["task_tracking_sessions"];

const runtimeFinancialUpdateColumns = [
  "service_payer",
  "service_amount",
  "tip_amount",
  "amount_due",
  "amount_paid",
  "collection_method",
  "status",
  "provider",
  "provider_reference",
  "updated_at",
  "paid_at",
];

const runtimeShiftUpdateColumns = [
  "status",
  "ended_at",
  "cash_expected",
  "cash_reported",
  "cash_variance",
  "cash_currency",
  "cash_reported_at",
  "cash_reported_by_membership_id",
];

export const runtimeRefundInsertColumns = [
  "id",
  "organization_id",
  "payment_id",
  "amount",
  "reason",
  "status",
  "authorized_by_membership_id",
  "idempotency_key",
  "provider",
  "requested_at",
  "completed_at",
];

export const runtimeMapSetupFunctions = [
  "public.map_setup_create_point(uuid,uuid,uuid,location_map_point_kind,text,text,numeric,numeric,text,boolean)",
  "public.map_setup_update_point(uuid,uuid,uuid,location_map_point_kind,text,text,numeric,numeric,text,boolean,timestamp with time zone)",
  "public.map_setup_create_area(uuid,uuid,uuid,location_map_area_purpose,text,text,text,boolean,uuid,numeric[],numeric[])",
  "public.map_setup_update_area(uuid,uuid,uuid,location_map_area_purpose,text,text,text,boolean,uuid,timestamp with time zone)",
  "public.map_setup_replace_area_vertices(uuid,uuid,uuid,numeric[],numeric[])",
];

export const runtimePrivateMapSetupFunctions = [
  "public.map_setup_authorized_organization(uuid,uuid)",
  "public.map_setup_validate_labels(text,text,text)",
  "public.map_setup_append_audit(uuid,uuid,uuid,text,text,uuid,text,boolean,boolean)",
];

export const runtimeMaintenanceFunctions = [
  "public.cleanup_expired_raw_gps_samples(integer)",
];

export const incidentReadPolicies = [
  ["public.incidents", "SELECT", true],
  ["public.incidents", "INSERT", true],
  ["public.incidents", "UPDATE", false],
  ["public.incidents", "DELETE", false],
  ["public.incidents", "TRUNCATE", false],
  ["public.incidents", "REFERENCES", false],
  ["public.incidents", "TRIGGER", false],
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

const authorityColumnRevokes = [
  `REVOKE INSERT (id, email, phone, password_hash, status, created_at,
                  updated_at, last_login_at),
          UPDATE (id, email, phone, password_hash, status, created_at,
                  updated_at, last_login_at)
   ON TABLE users FROM %I`,
  `REVOKE INSERT (id, organization_id, user_id, role, status, created_at,
                  updated_at),
          UPDATE (id, organization_id, user_id, role, status, created_at,
                  updated_at)
   ON TABLE organization_memberships FROM %I`,
  `REVOKE INSERT (organization_id, membership_id, location_id, created_at),
          UPDATE (organization_id, membership_id, location_id, created_at)
   ON TABLE membership_location_access FROM %I`,
];

export async function provisionRuntimeTablePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await client.query(
    `REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
     ON TABLE customers FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE customers FROM %I",
    [runtimeRole],
  );
  await client.query(
    `REVOKE INSERT, UPDATE, DELETE, TRUNCATE
     ON TABLE users, organization_memberships, membership_location_access
     FROM PUBLIC`,
  );
  for (const statement of authorityColumnRevokes) {
    await client.query(statement.replace("%I", "PUBLIC"));
  }
  await executeFormatted(
    client,
    "REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE users, organization_memberships, membership_location_access FROM %I",
    [runtimeRole],
  );
  for (const statement of authorityColumnRevokes) {
    await executeFormatted(client, statement, [runtimeRole]);
  }
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
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE payments, validations FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE validations TO %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE cash_entries FROM %I",
    [runtimeRole],
  );
  await executeFormatted(
    client,
    "GRANT SELECT, INSERT ON TABLE cash_entries TO %I",
    [runtimeRole],
  );
  for (const column of runtimeFinancialUpdateColumns) {
    await executeFormatted(
      client,
      "GRANT UPDATE (%I) ON TABLE payments TO %I",
      [column, runtimeRole],
    );
  }
  await executeFormatted(
    client,
    "GRANT UPDATE (is_current) ON TABLE validations TO %I",
    [runtimeRole],
  );
  for (const table of runtimeOperationalTables) {
    await executeFormatted(
      client,
      "GRANT SELECT, INSERT, UPDATE ON TABLE %I TO %I",
      [table, runtimeRole],
    );
  }
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE ON TABLE shifts FROM %I",
    [runtimeRole],
  );
  await executeFormatted(client, "GRANT SELECT, INSERT ON TABLE shifts TO %I", [
    runtimeRole,
  ]);
  for (const column of runtimeShiftUpdateColumns) {
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE shifts TO %I", [
      column,
      runtimeRole,
    ]);
  }
  for (const table of runtimeTrackingSessionTables) {
    await executeFormatted(client, "GRANT SELECT, INSERT ON TABLE %I TO %I", [
      table,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE %I TO %I", [
      "ended_at",
      table,
      runtimeRole,
    ]);
  }
  for (const [table, column] of runtimeLockColumns) {
    await executeFormatted(client, "GRANT UPDATE (%I) ON TABLE %I TO %I", [
      column,
      table,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeMapSetupFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      runtimeRole,
    ]);
  }
  for (const functionName of runtimeMaintenanceFunctions) {
    await executeFormatted(client, "REVOKE ALL ON FUNCTION %s FROM %I", [
      functionName,
      runtimeRole,
    ]);
    await executeFormatted(client, "GRANT EXECUTE ON FUNCTION %s TO %I", [
      functionName,
      runtimeRole,
    ]);
  }
  await provisionPaymentCollectionPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionProviderEventPrivileges(client, executeFormatted, runtimeRole);
  await provisionLocationConfigurationPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionBasicBrandingPrivileges(client, executeFormatted, runtimeRole);
  await provisionStaffPushPrivileges(client, executeFormatted, runtimeRole);
  for (const column of runtimeRefundInsertColumns) {
    await executeFormatted(client, "GRANT INSERT (%I) ON TABLE refunds TO %I", [
      column,
      runtimeRole,
    ]);
  }
}

import { provisionPaymentCollectionPrivileges } from "./payment-collection-runtime-privileges.mjs";
import { provisionProviderEventPrivileges } from "./provider-event-runtime-privileges.mjs";
import { provisionLocationConfigurationPrivileges } from "./location-configuration-runtime-privileges.mjs";
import { provisionBasicBrandingPrivileges } from "./basic-branding-runtime-privileges.mjs";
import { provisionStaffPushPrivileges } from "./staff-push-runtime-privileges.mjs";
import { provisionIncidentRecoveryPrivileges } from "./incident-recovery-runtime-privileges.mjs";
import { provisionShiftForceEndPrivileges } from "./shift-force-end-runtime-privileges.mjs";
import { revokeRuntimeStaffAuthority } from "./runtime-staff-authority-revokes.mjs";
import { provisionManagementSettingsPrivileges } from "./management-settings-runtime-privileges.mjs";
import { provisionManagementFeaturePrivileges } from "./management-runtime-privileges.mjs";
import { provisionShiftPresencePrivileges } from "./shift-presence-runtime-privileges.mjs";
import { provisionGuestBrowserPrivileges } from "./guest-browser-session-runtime-privileges.mjs";

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
  "public.map_setup_replace_area_vertices(uuid,uuid,uuid,numeric[],numeric[],timestamp with time zone)",
];

export const runtimePrivateMapSetupFunctions = [
  "public.map_setup_authorized_organization(uuid,uuid)",
  "public.map_setup_validate_labels(text,text,text)",
  "public.map_setup_append_audit(uuid,uuid,uuid,text,text,uuid,text,boolean,boolean)",
];

export const runtimeMaintenanceFunctions = [
  "public.cleanup_expired_raw_gps_samples(integer)",
  "public.cleanup_staff_push_v1()",
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
  await client.query(
    `REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
     ON TABLE customers FROM PUBLIC`,
  );
  await executeFormatted(
    client,
    "REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE customers FROM %I",
    [runtimeRole],
  );
  await revokeRuntimeStaffAuthority(client, executeFormatted, runtimeRole);
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
  await provisionIncidentRecoveryPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionShiftForceEndPrivileges(client, executeFormatted, runtimeRole);
  await provisionManagementSettingsPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionManagementFeaturePrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionShiftPresencePrivileges(client, executeFormatted, runtimeRole);
  await provisionGuestBrowserPrivileges(client, executeFormatted, runtimeRole);
  for (const column of runtimeRefundInsertColumns) {
    await executeFormatted(client, "GRANT INSERT (%I) ON TABLE refunds TO %I", [
      column,
      runtimeRole,
    ]);
  }
}

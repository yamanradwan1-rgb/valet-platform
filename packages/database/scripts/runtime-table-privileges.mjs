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
import { provisionGuestPushPrivileges } from "./guest-push-runtime-privileges.mjs";
import { provisionConditionPhotoRuntimePrivileges } from "./condition-photo-runtime-privileges.mjs";
import { provisionOutboundRuntimePrivileges } from "./outbound-runtime-privileges.mjs";
import { provisionGuestInformationPrivileges } from "./guest-information-runtime-privileges.mjs";
import { provisionIncidentResolutionPrivileges } from "./incident-resolution-runtime-privileges.mjs";
import { provisionManagementAlertTimingPrivileges } from "./management-alert-timing-runtime-privileges.mjs";
import { provisionManagementAlertSeenPrivileges } from "./management-alert-seen-runtime-privileges.mjs";
import { provisionOcrRuntimePrivileges } from "./ocr-runtime-privileges.mjs";

import {
  runtimeFinancialUpdateColumns,
  runtimeInsertOnlyTables,
  runtimeLockColumns,
  runtimeMaintenanceFunctions,
  runtimeMapSetupFunctions,
  runtimeOperationalTables,
  runtimeReadOnlyTables,
  runtimeRefundInsertColumns,
  runtimeShiftUpdateColumns,
  runtimeTrackingSessionTables,
} from "./runtime-table-privilege-inventory.mjs";

export {
  customerPrivileges,
  runtimeLockColumns,
  runtimeMaintenanceFunctions,
  runtimeMapSetupFunctions,
  runtimePrivateMapSetupFunctions,
  runtimeRefundInsertColumns,
} from "./runtime-table-privilege-inventory.mjs";

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
  await provisionIncidentResolutionPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionManagementAlertTimingPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionManagementAlertSeenPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
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
  await provisionGuestPushPrivileges(client, executeFormatted, runtimeRole);
  await provisionConditionPhotoRuntimePrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionOutboundRuntimePrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionGuestInformationPrivileges(
    client,
    executeFormatted,
    runtimeRole,
  );
  await provisionOcrRuntimePrivileges(client, executeFormatted, runtimeRole);
  for (const column of runtimeRefundInsertColumns) {
    await executeFormatted(client, "GRANT INSERT (%I) ON TABLE refunds TO %I", [
      column,
      runtimeRole,
    ]);
  }
}

import { verifyLocationConfigurationPrivileges } from "./location-configuration-runtime-privileges.mjs";
import { verifyBasicBrandingPrivileges } from "./basic-branding-runtime-privileges.mjs";
import { verifyAuditFoundationPrivileges } from "./audit-foundation-runtime-privilege-verification.mjs";
import { verifyMfaPrivileges } from "./mfa-runtime-privilege-verification.mjs";
import { verifyShiftForceEndPrivileges } from "./shift-force-end-runtime-privileges.mjs";
import { verifyManagementSettingsPrivileges } from "./management-settings-runtime-privileges.mjs";
import { verifyManagementFeaturePrivileges } from "./management-runtime-privileges.mjs";
import { verifyGuestRuntimePrivileges } from "./guest-runtime-privileges.mjs";
import { verifyConditionPhotoRuntimePrivileges } from "./condition-photo-runtime-privileges.mjs";

export async function verifyRuntimeFeaturePrivileges(client, runtimeRole) {
  await verifyLocationConfigurationPrivileges(client, runtimeRole);
  await verifyBasicBrandingPrivileges(client, runtimeRole);
  await verifyAuditFoundationPrivileges(client, runtimeRole);
  await verifyMfaPrivileges(client, runtimeRole);
  await verifyShiftForceEndPrivileges(client, runtimeRole);
  await verifyManagementSettingsPrivileges(client, runtimeRole);
  await verifyManagementFeaturePrivileges(client, runtimeRole);
  await verifyGuestRuntimePrivileges(client, runtimeRole);
  await verifyConditionPhotoRuntimePrivileges(client, runtimeRole);
}

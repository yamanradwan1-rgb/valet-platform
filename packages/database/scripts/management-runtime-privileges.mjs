import {
  provisionLocationLifecyclePrivileges,
  verifyLocationLifecyclePrivileges,
} from "./location-lifecycle-runtime-privileges.mjs";
import {
  provisionVisitContactPrivileges,
  verifyVisitContactPrivileges,
} from "./visit-contact-runtime-privileges.mjs";
import {
  provisionGuestRatingPrivileges,
  verifyGuestRatingPrivileges,
} from "./guest-rating-runtime-privileges.mjs";

export async function provisionManagementFeaturePrivileges(
  client,
  executeFormatted,
  runtimeRole,
) {
  await provisionLocationLifecyclePrivileges(client, executeFormatted, runtimeRole);
  await provisionVisitContactPrivileges(client, executeFormatted, runtimeRole);
  await provisionGuestRatingPrivileges(client, executeFormatted, runtimeRole);
}

export async function verifyManagementFeaturePrivileges(client, runtimeRole) {
  await verifyLocationLifecyclePrivileges(client, runtimeRole);
  await verifyVisitContactPrivileges(client, runtimeRole);
  await verifyGuestRatingPrivileges(client, runtimeRole);
}

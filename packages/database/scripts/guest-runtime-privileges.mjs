import { verifyGuestBrowserPrivileges } from "./guest-browser-session-runtime-privileges.mjs";
import { verifyGuestPushPrivileges } from "./guest-push-runtime-privileges.mjs";
import { verifyS04RuntimePrivileges } from "./s04-runtime-privileges.mjs";

export async function verifyGuestRuntimePrivileges(client, runtimeRole) {
  await verifyGuestBrowserPrivileges(client, runtimeRole);
  await verifyGuestPushPrivileges(client, runtimeRole);
  await verifyS04RuntimePrivileges(client, runtimeRole);
}

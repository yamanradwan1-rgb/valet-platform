import { requireManagementUuid } from "./staff-management-http";
import type { PresenceManagementTarget } from "./presence-management-authority";
export {
  parsePresenceCommand,
  presenceManagementHttpContext,
} from "../auth/staff-presence-http";

export function presenceLocationHttpTarget(
  authority: PresenceManagementTarget["authority"],
  params: Record<string, string>,
): PresenceManagementTarget {
  return {
    authority,
    locationId: requireManagementUuid(params.locationId!),
    ...(authority === "COMPANY_ADMIN"
      ? { organizationId: requireManagementUuid(params.organizationId!) }
      : {}),
  };
}

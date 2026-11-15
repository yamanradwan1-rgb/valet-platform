import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireManagementBearer } from "./staff-management-http";

// Only privileged Management command handlers receive raw bearer possession
// evidence. Ordinary StaffSessionContext remains hash-only.
export interface ManagementCommandContext extends StaffSessionContext {
  readonly rawAccessToken: string;
}

export function managementCommandContext(
  session: StaffSessionContext,
  authorization: string | undefined,
): ManagementCommandContext {
  return { ...session, rawAccessToken: requireManagementBearer(authorization) };
}

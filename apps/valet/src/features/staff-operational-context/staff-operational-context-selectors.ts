import type { StaffOperationalContextResponse } from "@valet/contracts";

import type { StaffAuthStatus } from "../../lib/auth/staff-auth-types";
import type { StaffOperationalContextState } from "./staff-operational-context-controller";

export function selectEffectiveOperationalResponse(
  status: StaffAuthStatus,
  accessToken: string | null,
  sessionGeneration: number,
  controllerState: StaffOperationalContextState,
): StaffOperationalContextResponse | null {
  if (
    status !== "authenticated" ||
    !accessToken ||
    controllerState.sessionGeneration !== sessionGeneration
  ) {
    return null;
  }
  return controllerState.response;
}

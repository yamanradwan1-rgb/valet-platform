import type { StaffOperationalContextResponse } from "@valet/contracts";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export interface StaffOperationalContextState {
  readonly sessionGeneration: number | null;
  readonly response: StaffOperationalContextResponse | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

export interface StaffOperationalContextControllerOptions {
  readonly apiClient: EmployeeApiClient;
  readonly onStateChange?:
    ((state: StaffOperationalContextState) => void) | undefined;
}

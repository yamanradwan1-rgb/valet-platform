import type { StaffTaskQueueItem } from "@valet/contracts";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";

export interface TaskQueueState {
  readonly sessionGeneration: number | null;
  readonly scopeLocationId: string | null;
  readonly tasks: StaffTaskQueueItem[];
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isHardStopped: boolean;
  readonly error: Error | null;
}

export interface TaskQueueControllerOptions {
  readonly apiClient: EmployeeApiClient;
  readonly pollingIntervalMs?: number | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onStateChange?: ((state: TaskQueueState) => void) | undefined;
}

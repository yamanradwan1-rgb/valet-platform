import type { StaffVehicleDirectoryResponse } from "@valet/contracts";

import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
} from "./employee-operational-types";

export type EmployeeVehicleDirectoryPhase =
  "error" | "inactive" | "loading" | "ready" | "refreshing";

export interface EmployeeVehicleDirectorySnapshot {
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly page: StaffVehicleDirectoryResponse | null;
  readonly phase: EmployeeVehicleDirectoryPhase;
  readonly scope: EmployeeOperationalScope | null;
}

export interface EmployeeVehicleDirectoryTransport {
  load(
    locationId: string,
    signal?: AbortSignal,
  ): Promise<StaffVehicleDirectoryResponse>;
}

export interface EmployeeVehicleDirectoryOptions {
  readonly transport: EmployeeVehicleDirectoryTransport;
}

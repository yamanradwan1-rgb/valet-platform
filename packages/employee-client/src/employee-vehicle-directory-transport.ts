import {
  staffVehicleDirectoryActionsResponseSchema,
  staffVehicleDirectoryActionsCapability,
  staffVehicleDirectoryResponseSchema,
  staffVehicleDirectoryVisibilityCapability,
  staffVehicleDirectoryVisibilityCapabilityHeader,
  type StaffVehicleDirectoryResponse,
} from "@valet/contracts";

import type { EmployeeClient } from "./employee-client";
import type { EmployeeVehicleDirectoryTransport } from "./employee-vehicle-directory-types";

export function createEmployeeVehicleDirectoryTransport(
  clientFactory: (signal?: AbortSignal) => EmployeeClient,
  options: { readonly checkInActions?: boolean } = {},
): EmployeeVehicleDirectoryTransport {
  return {
    async load(locationId, signal): Promise<StaffVehicleDirectoryResponse> {
      const raw = await clientFactory(signal).request<unknown>({
        headers: {
          [staffVehicleDirectoryVisibilityCapabilityHeader]:
            options.checkInActions
              ? staffVehicleDirectoryActionsCapability
              : staffVehicleDirectoryVisibilityCapability,
        },
        method: "GET",
        params: { locationId },
        path: "/v1/staff/valet-sessions/directory",
      });
      return options.checkInActions
        ? staffVehicleDirectoryActionsResponseSchema.parse(raw)
        : staffVehicleDirectoryResponseSchema.parse(raw);
    },
  };
}

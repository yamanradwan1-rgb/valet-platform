import type { ReactElement } from "react";
import { vi } from "vitest";
import type {
  EmployeeVehicleDirectorySnapshot,
  StaffVehicleDirectoryRow,
} from "@valet/employee-client";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: <T,>(value: T) => [value, vi.fn()] };
});
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

export const { NativeVehiclesScreen } =
  await import("../src/vehicles/native-vehicles-screen");
export const { NativeVehicleRow } =
  await import("../src/vehicles/native-vehicle-row");
export const { nativeVehicleBadge, nativeVehicleTitle } =
  await import("../src/vehicles/native-vehicle-presentation");
export const { getNativeVehiclesCopy } =
  await import("../src/vehicles/native-vehicles-copy");
export const { EmployeeButton } =
  await import("../src/employee-ui/employee-controls");
export const { EmployeeBadge } =
  await import("../src/employee-ui/employee-feedback");
export const { nativeVehicleRowStyles } =
  await import("../src/vehicles/native-vehicle-row-styles");

export type VehicleElement = ReactElement<Record<string, unknown>>;

export function vehicleElements(value: unknown): VehicleElement[] {
  if (Array.isArray(value)) return value.flatMap(vehicleElements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as VehicleElement;
  return [node, ...vehicleElements(node.props.children)];
}

export const vehicleScope = {
  locationCode: "AMM",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE" as const,
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-03T08:00:00.000Z",
};

export const vehicleRow: StaffVehicleDirectoryRow = {
  createdAt: "2026-09-03T08:00:00.000Z",
  keySlotCode: null,
  keySlotVisibility: "RESTRICTED",
  parkingSpotCode: "12",
  parkingZoneCode: "North",
  sessionId: "55555555-5555-4555-8555-555555555555",
  state: "PARKED",
  updatedAt: "2026-09-03T09:00:00.000Z",
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
};

export function vehicleSnapshot(
  phase: EmployeeVehicleDirectorySnapshot["phase"],
  rows: StaffVehicleDirectoryRow[] = [],
  truncated = false,
): EmployeeVehicleDirectorySnapshot {
  return {
    failure:
      phase === "error"
        ? { code: "NETWORK", message: "offline", status: 0 }
        : null,
    identityGeneration: 7,
    page:
      phase === "loading"
        ? null
        : { locationId: vehicleScope.locationId, rows, truncated },
    phase,
    scope: vehicleScope,
  };
}

export function renderVehiclesScreen(state: EmployeeVehicleDirectorySnapshot) {
  return vehicleElements(
    NativeVehiclesScreen({
      directory: { refresh: vi.fn() } as never,
      locale: "en",
      scope: vehicleScope,
      snapshot: state,
      textAlign: "left",
    }),
  );
}

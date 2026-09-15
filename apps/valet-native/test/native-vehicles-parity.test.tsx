import { describe, expect, it } from "vitest";
import type { StaffVehicleDirectoryRow } from "@valet/employee-client";

import {
  EmployeeButton,
  getNativeVehiclesCopy,
  NativeVehicleRow,
  nativeVehicleBadge,
  nativeVehicleTitle,
  renderVehiclesScreen,
  vehicleRow,
  vehicleSnapshot,
} from "./native-vehicles-test-fixture";

describe("Native Vehicles Web parity", () => {
  it("renders initial loading with exactly three row skeletons", () => {
    const nodes = renderVehiclesScreen(vehicleSnapshot("loading"));
    expect(
      nodes.filter(
        (node) =>
          typeof node.type === "function" &&
          node.type.name === "VehicleSkeleton",
      ),
    ).toHaveLength(3);
    expect(
      nodes.some((node) => node.props.children === "Loading vehicles..."),
    ).toBe(true);
  });

  it("renders refreshing, error/retry, empty, truncated and loaded states", () => {
    expect(
      renderVehiclesScreen(vehicleSnapshot("refreshing", [vehicleRow])).some(
        (node) => node.props.children === "Refreshing...",
      ),
    ).toBe(true);
    expect(
      renderVehiclesScreen(vehicleSnapshot("error")).some(
        (node) => node.type === EmployeeButton && node.props.label === "Retry",
      ),
    ).toBe(true);
    expect(
      renderVehiclesScreen(vehicleSnapshot("ready")).some(
        (node) => node.props.children === "No active vehicles right now",
      ),
    ).toBe(true);
    expect(
      renderVehiclesScreen(vehicleSnapshot("ready", [vehicleRow], true)).some(
        (node) => node.props.children === getNativeVehiclesCopy("en").truncated,
      ),
    ).toBe(true);
    expect(
      renderVehiclesScreen(vehicleSnapshot("ready", [vehicleRow])).some(
        (node) => node.type === NativeVehicleRow,
      ),
    ).toBe(true);
  });

  it("matches title fallback precedence and all lifecycle badge mappings", () => {
    expect(nativeVehicleTitle(vehicleRow, "fallback")).toBe("Toyota Camry");
    expect(
      nativeVehicleTitle(
        {
          ...vehicleRow,
          vehicle: {
            ...vehicleRow.vehicle,
            make: null,
            model: null,
            temporaryDescriptor: "White sedan",
          },
        },
        "fallback",
      ),
    ).toBe("White sedan");
    expect(
      nativeVehicleTitle(
        {
          ...vehicleRow,
          vehicle: {
            ...vehicleRow.vehicle,
            make: null,
            model: null,
            temporaryDescriptor: null,
          },
        },
        "fallback",
      ),
    ).toBe("fallback");
    const expected = {
      CHECKING_IN: "primary",
      AWAITING_PARKING: "neutral",
      PARKING: "warning",
      PARKED: "success",
      REQUESTED: "warning",
      RETRIEVING: "primary",
      READY: "success",
      HANDOFF_PENDING: "successSoft",
    };
    for (const [state, variant] of Object.entries(expected)) {
      expect(
        nativeVehicleBadge(
          { ...vehicleRow, state } as StaffVehicleDirectoryRow,
          getNativeVehiclesCopy("en"),
        ).variant,
      ).toBe(variant);
    }
  });
});

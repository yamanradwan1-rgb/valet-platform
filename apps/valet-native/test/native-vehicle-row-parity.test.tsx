import { describe, expect, it, vi } from "vitest";
import type { StaffVehicleDirectoryRow } from "@valet/employee-client";

import {
  EmployeeBadge,
  getNativeVehiclesCopy,
  NativeVehicleRow,
  nativeVehicleRowStyles,
  vehicleElements,
  vehicleRow,
} from "./native-vehicles-test-fixture";

describe("Native Vehicle row Web parity", () => {
  it("expands already-held read-only detail without fetch or mutation", () => {
    const onToggle = vi.fn();
    const nodes = vehicleElements(
      NativeVehicleRow({
        copy: getNativeVehiclesCopy("en"),
        expanded: true,
        locale: "en",
        onToggle,
        row: vehicleRow,
        textAlign: "left",
      }),
    );
    const control = nodes.find(
      (node) => node.props.accessibilityState?.expanded === true,
    )!;
    (control.props.onPress as () => void)();
    expect(onToggle).toHaveBeenCalledOnce();
    const keySlotValues = nodes
      .filter(
        (node) =>
          typeof node.type === "function" &&
          ["Detail", "Summary"].includes(node.type.name) &&
          node.props.label === "Key slot",
      )
      .map((node) => node.props.value);
    expect(keySlotValues).toEqual(["Restricted", "Restricted"]);
    const children = JSON.stringify(nodes.map((node) => node.props.children));
    expect(children).toContain("North");
    expect(children).toContain("12");
    const badges = nodes.filter((node) => node.type === EmployeeBadge);
    expect(badges).toHaveLength(2);
    expect(badges[1]?.props).toMatchObject({
      label: "Parked",
      showDot: true,
      variant: "success",
    });
    const spot = nodes.find(
      (node) =>
        typeof node.type === "function" &&
        node.type.name === "Detail" &&
        node.props.label === "Spot Code",
    )!;
    expect(spot.props.last).toBe(true);
    expect(nativeVehicleRowStyles.detailRowLast).toEqual({
      borderBottomWidth: 0,
    });
  });

  it("distinguishes visible, restricted and genuinely unassigned key slots", () => {
    const copy = getNativeVehiclesCopy("en");
    const render = (candidate: StaffVehicleDirectoryRow) =>
      vehicleElements(
        NativeVehicleRow({
          copy,
          expanded: true,
          locale: "en",
          onToggle: vi.fn(),
          row: candidate,
          textAlign: "left",
        }),
      )
        .filter(
          (node) =>
            typeof node.type === "function" &&
            ["Detail", "Summary"].includes(node.type.name) &&
            node.props.label === copy.keySlot,
        )
        .map((node) => node.props.value);

    expect(
      render({
        ...vehicleRow,
        keySlotCode: "K-03",
        keySlotVisibility: "VISIBLE",
      }),
    ).toEqual(["K-03", "K-03"]);
    expect(render(vehicleRow)).toEqual(["Restricted", "Restricted"]);
    expect(render({ ...vehicleRow, keySlotVisibility: "UNASSIGNED" })).toEqual([
      null,
      "Not assigned",
    ]);
  });

  it("keeps exact EN/AR directory copy and identifier LTR semantics", () => {
    expect(getNativeVehiclesCopy("en").emptyTitle).toBe(
      "No active vehicles right now",
    );
    expect(getNativeVehiclesCopy("ar").emptyTitle).toBe(
      "لا توجد مركبات نشطة الآن",
    );
    expect(getNativeVehiclesCopy("ar").keySlotRestricted).toBe("مقيّد");
    expect(getNativeVehiclesCopy("en").keySlotRestricted).toBe("Restricted");
    const nodes = vehicleElements(
      NativeVehicleRow({
        copy: getNativeVehiclesCopy("ar"),
        expanded: false,
        locale: "ar",
        onToggle: vi.fn(),
        row: vehicleRow,
        textAlign: "right",
      }),
    );
    const plate = nodes.find((node) =>
      String(node.props.children).includes("12-34567"),
    )!;
    expect(JSON.stringify(plate.props.style)).toContain(
      '"writingDirection":"ltr"',
    );
  });
});

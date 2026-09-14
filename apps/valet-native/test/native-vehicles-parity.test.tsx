import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
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

const { NativeVehiclesScreen } =
  await import("../src/vehicles/native-vehicles-screen");
const { NativeVehicleRow } = await import("../src/vehicles/native-vehicle-row");
const { nativeVehicleBadge, nativeVehicleTitle } =
  await import("../src/vehicles/native-vehicle-presentation");
const { getNativeVehiclesCopy } =
  await import("../src/vehicles/native-vehicles-copy");
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");
const { EmployeeBadge } = await import("../src/employee-ui/employee-feedback");
const { nativeVehicleRowStyles } =
  await import("../src/vehicles/native-vehicle-row-styles");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const scope = {
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
const row: StaffVehicleDirectoryRow = {
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

function snapshot(
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
        : { locationId: scope.locationId, rows, truncated },
    phase,
    scope,
  };
}

function screen(state: EmployeeVehicleDirectorySnapshot) {
  return elements(
    NativeVehiclesScreen({
      directory: { refresh: vi.fn() } as never,
      locale: "en",
      scope,
      snapshot: state,
      textAlign: "left",
    }),
  );
}

describe("Native Vehicles Web parity", () => {
  it("renders initial loading with exactly three row skeletons", () => {
    const nodes = screen(snapshot("loading"));
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
      screen(snapshot("refreshing", [row])).some(
        (node) => node.props.children === "Refreshing...",
      ),
    ).toBe(true);
    expect(
      screen(snapshot("error")).some(
        (node) => node.type === EmployeeButton && node.props.label === "Retry",
      ),
    ).toBe(true);
    expect(
      screen(snapshot("ready")).some(
        (node) => node.props.children === "No active vehicles right now",
      ),
    ).toBe(true);
    expect(
      screen(snapshot("ready", [row], true)).some(
        (node) => node.props.children === getNativeVehiclesCopy("en").truncated,
      ),
    ).toBe(true);
    expect(
      screen(snapshot("ready", [row])).some(
        (node) => node.type === NativeVehicleRow,
      ),
    ).toBe(true);
  });

  it("matches title fallback precedence and all lifecycle badge mappings", () => {
    expect(nativeVehicleTitle(row, "fallback")).toBe("Toyota Camry");
    expect(
      nativeVehicleTitle(
        {
          ...row,
          vehicle: {
            ...row.vehicle,
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
          ...row,
          vehicle: {
            ...row.vehicle,
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
          { ...row, state } as StaffVehicleDirectoryRow,
          getNativeVehiclesCopy("en"),
        ).variant,
      ).toBe(variant);
    }
  });

  it("expands already-held read-only detail without fetch or mutation", () => {
    const onToggle = vi.fn();
    const nodes = elements(
      NativeVehicleRow({
        copy: getNativeVehiclesCopy("en"),
        expanded: true,
        locale: "en",
        onToggle,
        row,
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
    expect(JSON.stringify(nodes.map((node) => node.props.children))).toContain(
      "North",
    );
    expect(JSON.stringify(nodes.map((node) => node.props.children))).toContain(
      "12",
    );
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
      elements(
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

    const visible = render({
      ...row,
      keySlotCode: "K-03",
      keySlotVisibility: "VISIBLE",
    });
    expect(visible).toEqual(["K-03", "K-03"]);

    const restricted = render(row);
    expect(restricted).toEqual(["Restricted", "Restricted"]);

    const unassigned = render({ ...row, keySlotVisibility: "UNASSIGNED" });
    expect(unassigned).toEqual([null, "Not assigned"]);
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
    const nodes = elements(
      NativeVehicleRow({
        copy: getNativeVehiclesCopy("ar"),
        expanded: false,
        locale: "ar",
        onToggle: vi.fn(),
        row,
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

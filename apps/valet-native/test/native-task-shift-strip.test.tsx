import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EmployeeOperationalScope } from "@valet/employee-client";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeTaskShiftStrip } =
  await import("../src/tasks/native-task-shift-strip");
const { employeeColors } = await import("../src/employee-ui/employee-tokens");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function style(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.filter(Boolean).map(style));
  }
  return (value ?? {}) as Record<string, unknown>;
}

const scope: EmployeeOperationalScope = {
  locationCode: "AMM-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE",
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-04T08:00:00.000Z",
};

describe("Native Task active-shift strip", () => {
  it("uses the compact Web-derived surface and only visible truthful fields", () => {
    const nodes = elements(
      NativeTaskShiftStrip({
        activeLabel: "Active shift",
        scope,
        textAlign: "left",
      }),
    );
    const strip = nodes.find(
      (node) => node.props.testID === "native-task-shift-strip",
    )!;
    const visibleText = nodes
      .filter((node) => node.type === "Text")
      .map((node) => node.props.children);

    expect(style(strip.props.style)).toMatchObject({
      backgroundColor: employeeColors.navy3,
      borderRadius: 12,
      direction: "ltr",
      paddingHorizontal: 16,
      paddingVertical: 8,
    });
    expect(strip.props.accessible).toBe(true);
    expect(visibleText).toEqual(["Active shift", "Amman Hotel"]);
    expect(JSON.stringify(visibleText)).not.toContain(scope.organizationName);
    expect(JSON.stringify(visibleText)).not.toContain(scope.role);
    expect(JSON.stringify(visibleText)).not.toContain(scope.shiftId);
    expect(JSON.stringify(visibleText)).not.toContain(scope.shiftStartedAt);
  });

  it("uses a truthful success indicator and intentional Arabic direction", () => {
    const nodes = elements(
      NativeTaskShiftStrip({
        activeLabel: "وردية نشطة",
        scope,
        textAlign: "right",
      }),
    );
    const strip = nodes.find(
      (node) => node.props.testID === "native-task-shift-strip",
    )!;
    const indicator = nodes.find(
      (node) =>
        style(node.props.style).backgroundColor === employeeColors.success,
    )!;
    const text = nodes.find((node) => node.props.children === "وردية نشطة")!;

    expect(style(strip.props.style).direction).toBe("rtl");
    expect(style(indicator.props.style)).toMatchObject({ height: 8, width: 8 });
    expect(style(text.props.style)).toMatchObject({
      textAlign: "right",
      writingDirection: "rtl",
    });
  });
});

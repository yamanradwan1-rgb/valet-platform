import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeActiveShiftPanel } =
  await import("../src/shift/native-active-shift-panel");
const { EmployeeBadge } = await import("../src/employee-ui/employee-feedback");
const { scope } = await import("./production-shell-test-fixture");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

describe("Native active Shift presentation", () => {
  it("shows only authoritative active facts and keeps the Location code separate", () => {
    const nodes = elements(
      NativeActiveShiftPanel({ locale: "en", scope, textAlign: "left" }),
    );
    const badge = nodes.find((node) => node.type === EmployeeBadge)!;
    const infoRows = nodes.filter(
      (node) => typeof node.type === "function" && node.type.name === "InfoRow",
    );
    const serialized = JSON.stringify(nodes.map((node) => node.props));

    expect(badge.props).toMatchObject({
      label: "Active shift",
      variant: "success",
    });
    expect(infoRows.map((node) => node.props.label)).toEqual([
      "Organization",
      "Location",
      "Role",
      "Started",
    ]);
    expect(infoRows[1]?.props).toMatchObject({
      secondaryIdentifier: "AMM-1",
      value: "Amman Hotel",
    });
    expect(serialized).not.toContain(scope.shiftId);
    expect(serialized).not.toContain("End Shift");
    expect(serialized).not.toContain("summary");
    expect(serialized).not.toContain("cash");
  });

  it("ships Arabic active labels and RTL text behavior", () => {
    const nodes = elements(
      NativeActiveShiftPanel({ locale: "ar", scope, textAlign: "right" }),
    );
    const serialized = JSON.stringify(nodes.map((node) => node.props));

    expect(serialized).toContain("مناوبة نشطة");
    expect(serialized).toContain("الموقع");
    expect(serialized).toContain('"writingDirection":"rtl"');
  });
});

import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Text: "Text", View: "View" }));
vi.mock("../src/appearance/employee-appearance-context", () => ({
  useEmployeePalette: () => ({ warning: "#D89434" }),
}));
vi.mock("../src/employee-ui/employee-controls", () => ({
  EmployeeButton: "EmployeeButton",
}));
vi.mock("../src/employee-ui/employee-feedback", () => ({
  EmployeeCard: "EmployeeCard",
  EmployeeStatus: "EmployeeStatus",
}));

const { NativeBatteryNotice } = await import(
  "../src/notifications/native-battery-warning"
);
const { nativeBatteryCopy } = await import(
  "../src/notifications/native-battery-copy"
);

type Tree = ReactElement<Record<string, unknown>>;
function nodes(value: unknown): Tree[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value !== "object" || value === null || !("props" in value)) return [];
  const node = value as Tree;
  return [node, ...nodes(node.props.children)];
}

describe("#274 conditional-only Native status-area warning", () => {
  it.each(["checking", "configured", "unknown", "unsupported"] as const)(
    "%s creates no view, placeholder or reserved layout",
    (status) => {
      expect(NativeBatteryNotice({ locale: "en", status, onOpenSettings: vi.fn() })).toBeNull();
    },
  );

  it.each(["en", "ar"] as const)(
    "uses exact %s approved-category copy, existing components and explicit accessible action",
    (locale) => {
      const onOpenSettings = vi.fn();
      const tree = NativeBatteryNotice({ locale, onOpenSettings, status: "restricted" });
      const visible = nodes(tree);
      const serialized = JSON.stringify(tree);
      expect(serialized).toContain(nativeBatteryCopy[locale].title);
      expect(serialized).toContain(nativeBatteryCopy[locale].detail);
      expect(serialized).toContain(nativeBatteryCopy[locale].action);
      expect(visible.filter((node) => node.props.testID === "native-battery-warning")).toHaveLength(1);
      expect(visible.some((node) => node.type === "EmployeeCard")).toBe(true);
      const action = visible.find((node) => node.type === "EmployeeButton")!;
      expect(action.props.variant).toBe("secondary");
      expect(action.props.size).toBe("standard");
      (action.props.onPress as () => void)();
      expect(onOpenSettings).toHaveBeenCalledOnce();
      expect(serialized).toContain(locale === "ar" ? "right" : "left");
      expect(serialized).toContain("alert");
    },
  );
});

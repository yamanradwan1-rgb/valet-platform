import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  owner: undefined as unknown,
  value: undefined as unknown,
}));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (factory: () => unknown) => [(hooks.owner ??= factory())],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
  useEffect: (effect: () => void) => effect(),
  useContext: () => hooks.value,
}));
vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("../src/appearance/native-appearance-store", async () => ({
  ...(await vi.importActual<
    typeof import("../src/appearance/native-appearance-store")
  >("../src/appearance/native-appearance-store")),
  nativeAppearanceStore: {
    read: async () => '{"version":1,"theme":"dark"}',
    write: vi.fn(),
  },
}));
vi.unmock("../src/appearance/employee-appearance-context");
import {
  EmployeeAppearanceProvider,
  useEmployeePalette,
  useEmployeeStyles,
} from "../src/appearance/employee-appearance-context";
import { NativeAppearanceOwner } from "../src/appearance/native-appearance-owner";

describe("one root appearance provider", () => {
  it("restores before revealing UI and preserves owner/child identity across switches", async () => {
    const child = <operational-runtime />;
    const render = () => {
      const node = EmployeeAppearanceProvider({
        children: child,
      }) as ReactElement<{
        value: { ready: boolean; select: (mode: "light" | "dark") => void };
        children: unknown;
      }>;
      hooks.value = node.props.value;
      return node;
    };
    expect(render().props.value.ready).toBe(false);
    const owner = hooks.owner as NativeAppearanceOwner;
    await owner.restore();
    expect(render().props.value.ready).toBe(true);
    expect(useEmployeePalette().mode).toBe("dark");
    const sheets = { light: { id: "light" }, dark: { id: "dark" } };
    expect(useEmployeeStyles(sheets)).toBe(sheets.dark);
    render().props.value.select("light");
    expect(render().props.children).toBe(child);
    expect(hooks.owner).toBe(owner);
    expect(useEmployeePalette().mode).toBe("light");
    expect(useEmployeeStyles(sheets)).toBe(sheets.light);
    render().props.value.select("dark");
    expect(render().props.children).toBe(child);
    expect(hooks.owner).toBe(owner);
  });
});

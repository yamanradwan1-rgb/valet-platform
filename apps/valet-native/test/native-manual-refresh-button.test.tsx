import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ index: 0, values: [] as unknown[] }));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (next: unknown) => {
        hooks.values[index] = next;
      },
    ];
  },
}));

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeManualRefreshButton } =
  await import("../src/tasks/native-manual-refresh-button");
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");

type Element = ReactElement<Record<string, unknown>>;

let onRefresh: ReturnType<typeof vi.fn>;

function render(disabled = false): Element {
  hooks.index = 0;
  return NativeManualRefreshButton({
    disabled,
    label: "Refresh",
    onRefresh,
  }) as Element;
}

beforeEach(() => {
  hooks.index = 0;
  hooks.values = [];
  onRefresh = vi.fn(() => Promise.resolve());
});

describe("Native manual refresh presentation", () => {
  it("stays visually idle until the employee presses Refresh", () => {
    const button = render();

    expect(button.type).toBe(EmployeeButton);
    expect(button.props).toMatchObject({ busy: false, disabled: false });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("shows busy feedback only while the manual refresh promise is pending", async () => {
    let resolveRefresh: (() => void) | undefined;
    onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    (render().props.onPress as () => void)();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(render().props.busy).toBe(true);

    resolveRefresh?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(render().props.busy).toBe(false);
  });

  it("does not start manual refresh while initial loading disables it", () => {
    const button = render(true);
    (button.props.onPress as () => void)();

    expect(button.props).toMatchObject({ busy: false, disabled: true });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

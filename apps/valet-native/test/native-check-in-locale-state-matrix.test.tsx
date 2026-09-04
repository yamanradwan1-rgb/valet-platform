import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
import {
  base,
  controller,
  localeStateCases,
  recognized,
  savedCustomer,
} from "./native-check-in-locale-state-fixtures";

vi.mock("react", () => ({
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("../src/check-in/native-plate-camera-step", () => ({
  NativePlateCameraStep: "NativePlateCameraStep",
}));

const { NativeCheckInWorkflow } =
  await import("../src/check-in/native-check-in-workflow");

type Element = ReactElement<Record<string, unknown>>;
type Locale = "en" | "ar";

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return elements((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...elements(node.props.children)];
}

function render(
  state: EmployeeCheckInSnapshot,
  locale: Locale,
  session = controller(),
) {
  const nodes = elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose: vi.fn(),
      session,
      snapshot: state,
    }),
  );
  const spoken = nodes
    .flatMap((node) =>
      [node.props.children, node.props.accessibilityLabel].flat(),
    )
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return { nodes, session, spoken };
}

describe("MOB-010 Patch 6 bilingual state matrix", () => {
  it.each(localeStateCases)(
    "renders $name with locale-correct hierarchy",
    ({ state, en, ar }) => {
      for (const [locale, expected] of [
        ["en", en],
        ["ar", ar],
      ] as const) {
        const { nodes, session, spoken } = render(state, locale);
        expect(
          nodes.filter(
            (node) =>
              node.props.accessibilityRole === "header" &&
              node.props.children === expected[0],
          ),
        ).toHaveLength(1);
        expect(spoken).toContain(expected[1]);
        expect(
          nodes.find((node) => node.type === "ScrollView")!.props
            .contentContainerStyle,
        ).toContainEqual({ direction: locale === "ar" ? "rtl" : "ltr" });
        for (const callback of Object.values(
          session as unknown as Record<string, unknown>,
        ).filter((value) => typeof value === "function"))
          expect(callback).not.toHaveBeenCalled();
      }
    },
  );

  it("changes language without changing operational state or firing callbacks", () => {
    const session = controller();
    const state = base({ phase: "returning", recognizedVehicle: recognized });
    const english = render(state, "en", session);
    const arabic = render(state, "ar", session);
    expect(english.spoken).toContain("Use saved customer");
    expect(arabic.spoken).toContain("استخدام العميل المحفوظ");
    expect(state.recognizedVehicle).toBe(recognized);
    for (const callback of Object.values(
      session as unknown as Record<string, unknown>,
    ).filter((value) => typeof value === "function"))
      expect(callback).not.toHaveBeenCalled();
  });

  it("exposes only the masked returning-customer suffix", () => {
    const { nodes, spoken } = render(
      base({ phase: "returning", recognizedVehicle: recognized }),
      "ar",
    );
    expect(spoken).toContain("0097");
    expect(spoken).not.toContain(savedCustomer.customerId);
    expect(spoken).not.toContain("+962790001234");
    const suffix = nodes.find((node) => node.props.children === "0097")!;
    expect(suffix.props.style).toMatchObject({ writingDirection: "ltr" });
  });
});

import type { ReactElement } from "react";
import type {
  EmployeeShiftStartSession,
  EmployeeShiftStartSnapshot,
} from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeShiftStartPanel } =
  await import("../src/shift/native-shift-start-panel");
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const locationA = {
  code: "AMM-1",
  currency: "JOD",
  locationId: "11111111-1111-4111-8111-111111111111",
  name: "Amman Hotel",
};
const locationB = {
  ...locationA,
  code: "AQJ-1",
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Aqaba Hotel",
};

function snapshot(
  overrides: Partial<EmployeeShiftStartSnapshot> = {},
): EmployeeShiftStartSnapshot {
  return {
    failure: null,
    identityGeneration: 1,
    phase: "ready",
    selectedLocationId: locationA.locationId,
    startableLocations: [locationA],
    targetLocationId: null,
    ...overrides,
  };
}

function session() {
  return {
    dismissUncertain: vi.fn(),
    retry: vi.fn(async () => undefined),
    selectLocation: vi.fn(),
    start: vi.fn(async () => undefined),
  } as unknown as EmployeeShiftStartSession;
}

function render(
  state: EmployeeShiftStartSnapshot,
  locale: "ar" | "en" = "en",
  owner = session(),
) {
  return {
    nodes: elements(
      NativeShiftStartPanel({ locale, session: owner, snapshot: state }),
    ),
    owner,
  };
}

describe("Native Start Shift presentation", () => {
  it("truthfully blocks zero eligible Locations without a Start action", () => {
    const { nodes } = render(
      snapshot({ selectedLocationId: null, startableLocations: [] }),
    );

    expect(
      nodes.some((node) => node.props.testID === "native-shift-start-blocked"),
    ).toBe(true);
    expect(nodes.some((node) => node.type === EmployeeButton)).toBe(false);
  });

  it("shows one authoritative preselection but waits for explicit Start press", () => {
    const owner = session();
    const { nodes } = render(snapshot(), "en", owner);
    const location = nodes.find(
      (node) => node.props.accessibilityRole === "radio",
    )!;
    const start = nodes.find(
      (node) =>
        node.type === EmployeeButton && node.props.label === "Start Shift",
    )!;

    expect(location.props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(start.props.disabled).toBe(false);
    expect(owner.start).not.toHaveBeenCalled();
    (start.props.onPress as () => void)();
    expect(owner.start).toHaveBeenCalledOnce();
  });

  it("requires an explicit accessible choice for multiple Locations", () => {
    const { nodes } = render(
      snapshot({
        selectedLocationId: null,
        startableLocations: [locationA, locationB],
      }),
    );
    const choices = nodes.filter(
      (node) => node.props.accessibilityRole === "radio",
    );
    const start = nodes.find(
      (node) =>
        node.type === EmployeeButton && node.props.label === "Start Shift",
    )!;

    expect(choices).toHaveLength(2);
    expect(start.props.disabled).toBe(true);
  });

  it("communicates submitting state through copy and accessibility busy state", () => {
    const { nodes } = render(snapshot({ phase: "submitting" }));
    const start = nodes.find(
      (node) =>
        node.type === EmployeeButton &&
        node.props.label === "Starting shift...",
    )!;
    const renderedButton = elements(
      EmployeeButton(start.props as Parameters<typeof EmployeeButton>[0]),
    ).find((node) => node.type === "Pressable")!;

    expect(start.props.busy).toBe(true);
    expect(
      nodes
        .filter((node) => node.props.accessibilityRole === "radio")
        .every(
          (node) =>
            (node.props.accessibilityState as { disabled: boolean }).disabled,
        ),
    ).toBe(true);
    expect(renderedButton.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it("ships localized conflict and uncertain recovery copy in EN and AR", () => {
    const english = render(snapshot({ phase: "conflict" })).nodes;
    const arabic = render(snapshot({ phase: "uncertain" }), "ar").nodes;
    const englishText = JSON.stringify(
      english.map((node) => node.props.children),
    );
    const arabicText = JSON.stringify(
      arabic.map((node) => node.props.children),
    );

    expect(englishText).toContain(
      "You already have an active shift at a different location.",
    );
    expect(arabicText).toContain("أكّد نتيجة بدء المناوبة");
    expect(
      arabic.some(
        (node) =>
          Array.isArray(node.props.style) &&
          JSON.stringify(node.props.style).includes('"writingDirection":"rtl"'),
      ),
    ).toBe(true);
  });

  it.each([
    ["en", "Start Shift could not be completed. Try again."],
    ["ar", "تعذر إكمال بدء المناوبة. أعد المحاولة."],
  ] as const)(
    "renders localized ordinary error copy for %s",
    (locale, copy) => {
      const { nodes } = render(snapshot({ phase: "error" }), locale);

      expect(
        JSON.stringify(nodes.map((node) => node.props.children)),
      ).toContain(copy);
    },
  );
});

import { describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@valet/employee-client";

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
const {
  conditionController,
  conditionSnapshot,
  content,
  elements,
  label,
  selectCondition,
  style,
} = await import("./native-check-in-condition-test-support");

type Node = Parameters<typeof NativeCheckInWorkflow>[0]["snapshot"];

function render(snapshot: Node, locale: "en" | "ar" = "en") {
  const checkIn = conditionController();
  const onClose = vi.fn();
  const nodes = elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose,
      session: checkIn,
      snapshot,
    }),
  );
  return { checkIn, nodes, onClose };
}

describe("MOB-011B Native condition and check-in completion", () => {
  it.each([
    [
      "en",
      "Vehicle Condition",
      "No visible issue",
      "Existing damage",
      "Needs review",
    ],
    [
      "ar",
      "حالة المركبة",
      "لا توجد مشاكل ظاهرة",
      "ضرر موجود مسبقًا",
      "تحتاج مراجعة",
    ],
  ] as const)(
    "presents the Web-matched condition options and policy notice in %s",
    (locale, title, noIssue, damage, review) => {
      const { nodes } = render(conditionSnapshot(), locale);
      expect(
        nodes.some(
          (node) =>
            node.props.accessibilityRole === "header" &&
            node.props.children === title,
        ),
      ).toBe(true);
      const options = nodes.filter(
        (node) =>
          node.type === "Pressable" &&
          node.props.accessibilityRole === "button" &&
          [noIssue, damage, review].some((o) => label(node).startsWith(o)),
      );
      expect(options).toHaveLength(3);
      expect(content(nodes)).toContain(
        locale === "en"
          ? "Photos optional by location policy"
          : "الصور اختيارية وفق سياسة الموقع",
      );
    },
  );

  it("selects an option through the portable session and shows its selected state", () => {
    const state = selectCondition(conditionSnapshot(), "Existing damage");
    const { checkIn, nodes } = render(state);
    const selected = nodes.find(
      (node) =>
        node.type === "Pressable" && label(node).startsWith("Existing damage"),
    )!;
    expect(selected.props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(style(selected)).toMatchObject({ backgroundColor: "#EDF4FF" });
    const unselected = nodes.find(
      (node) =>
        node.type === "Pressable" && label(node).startsWith("No visible issue"),
    )!;
    expect(unselected.props.accessibilityState).toMatchObject({
      selected: false,
    });
    (selected.props.onPress as () => void)();
    expect(checkIn.setConditionSelection).toHaveBeenCalledWith(
      "Existing damage",
    );
  });

  it("keeps LTR plate islands and RTL option text under Arabic", () => {
    const { nodes } = render(conditionSnapshot(), "ar");
    const plate = nodes.find((node) => node.props.children === "12-34567")!;
    expect(style(plate)).toMatchObject({
      writingDirection: "ltr",
      textAlign: "left",
    });
    const body = nodes.find((node) => node.type === "ScrollView")!;
    expect(body.props.contentContainerStyle).toContainEqual({
      direction: "rtl",
    });
  });

  it("disables duplicate submits while completion is in flight", () => {
    const state = conditionSnapshot("submitting");
    const { checkIn, nodes } = render({
      ...state,
      continuation: {
        ...state.continuation,
        conditionSelection: "No visible issue",
        pendingConditionSelection: "No visible issue",
        pendingConditionStage: "note",
      },
    });
    const progress = nodes.find(
      (node) => node.props.accessibilityRole === "progressbar",
    )!;
    expect(progress.props).toMatchObject({
      accessibilityLabel: "Completing Condition…",
      accessibilityState: { busy: true },
    });
    const back = nodes.find(
      (node) => node.type === "Pressable" && label(node) === "Back",
    )!;
    expect(back.props.disabled).toBe(true);
    (back.props.onPress as () => void)();
    expect(checkIn.cancelVehicleEdit).not.toHaveBeenCalled();
    expect(checkIn.submitConditionCompletion).not.toHaveBeenCalled();
  });

  it("shows the truthful required-photo block without fabricating completion", () => {
    const state = selectCondition(conditionSnapshot(), "Existing damage");
    const { checkIn, nodes } = render({
      ...state,
      error: {
        code: "CHECK_IN_CONDITION_PHOTO_REQUIRED",
        message: "Photo evidence required.",
        status: 409,
      },
    });
    expect(content(nodes)).toContain(
      "This location requires condition photos. Photo capture is not available yet; complete this step in Employee Web.",
    );
    expect(content(nodes)).not.toMatch(/uploaded|verified|photoComplete/i);
    const proceed = nodes.find(
      (node) => node.type === "Pressable" && label(node) === "Continue",
    )!;
    (proceed.props.onPress as () => void)();
    expect(checkIn.retryConditionRecovery).not.toHaveBeenCalled();
    expect(checkIn.submitConditionCompletion).toHaveBeenCalledOnce();
  });

  it("offers read-only authoritative recovery after an ambiguous completion", () => {
    const state = conditionSnapshot("ambiguous");
    const { checkIn, nodes } = render({
      ...state,
      continuation: {
        ...state.continuation,
        conditionSelection: "Needs review",
        pendingConditionSelection: "Needs review",
        pendingConditionStage: "completion",
      },
    });
    expect(content(nodes)).toContain(
      "The condition result is unknown. Check the authoritative session before retrying; the recorded note was preserved and will not be duplicated.",
    );
    const check = nodes.find(
      (node) =>
        node.type === "Pressable" && label(node) === "Check server state",
    )!;
    (check.props.onPress as () => void)();
    expect(checkIn.retryConditionRecovery).toHaveBeenCalledOnce();
    expect(checkIn.submitConditionCompletion).not.toHaveBeenCalled();
  });

  it("presents a localized conflict after a stale version with refreshed values", () => {
    const state = selectCondition(conditionSnapshot(), "No visible issue");
    const { nodes } = render({
      ...state,
      error: {
        code: "VERSION_CONFLICT",
        message: "Stale",
        status: 409,
      },
    });
    expect(content(nodes)).toContain(
      "Another operation changed this check-in. The current server state is shown; review it and try again.",
    );
    expect(content(nodes)).toContain("12-34567");
  });

  it("never renders a fabricated start-parking or key action before completion", () => {
    const { nodes } = render(conditionSnapshot());
    const copy = content(nodes);
    expect(copy).not.toMatch(/Start Parking|بدء الاصطفاف/);
    expect(copy).not.toMatch(/key slot|خانة المفتاح/i);
  });
});

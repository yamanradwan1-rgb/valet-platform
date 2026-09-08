import type { ReactElement } from "react";
import type {
  EmployeeShiftEndSession,
  EmployeeShiftEndSnapshot,
} from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

const { NativeActiveShiftPanel } =
  await import("../src/shift/native-active-shift-panel");
const { NativeShiftSummaryDetails, formatNativeShiftDuration } =
  await import("../src/shift/native-shift-summary-details");
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function visibleText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(visibleText).join(" ");
  if (!value || typeof value !== "object" || !("props" in value)) return "";
  return visibleText((value as Element).props.children);
}

const authority = {
  currency: "JOD",
  identityGeneration: 1,
  locationCode: "AMM-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "VAYLET Operator",
  role: "VALET_EMPLOYEE" as const,
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-08T08:00:00.000Z",
};

function snapshot(
  overrides: Partial<EmployeeShiftEndSnapshot> = {},
): EmployeeShiftEndSnapshot {
  return {
    authority,
    cashInput: "10.000",
    cashValidationVisible: false,
    failure: null,
    identityGeneration: 1,
    online: true,
    phase: "active",
    result: null,
    ...overrides,
  };
}

function owner() {
  return {
    cancelConfirmation: vi.fn(),
    endShift: vi.fn(async () => undefined),
    finish: vi.fn(),
    requestConfirmation: vi.fn(),
    retry: vi.fn(async () => undefined),
    setCashInput: vi.fn(),
  } as unknown as EmployeeShiftEndSession;
}

function render(
  state: EmployeeShiftEndSnapshot,
  locale: "ar" | "en" = "en",
  session = owner(),
) {
  const onReturned = vi.fn();
  const onReviewTasks = vi.fn();
  return {
    nodes: elements(
      NativeActiveShiftPanel({
        locale,
        onReturned,
        onReviewTasks,
        session,
        snapshot: state,
        textAlign: locale === "ar" ? "right" : "left",
      }),
    ),
    onReturned,
    onReviewTasks,
    session,
  };
}

function button(nodes: Element[], label: string): Element {
  return nodes.find(
    (node) => node.type === EmployeeButton && node.props.label === label,
  )!;
}

describe("Native Shift summary and End Shift", () => {
  it("presents bounded authoritative summary without raw Shift identity or metrics", () => {
    const { nodes } = render(snapshot());
    const details = nodes.find(
      (node) => node.type === NativeShiftSummaryDetails,
    )!;
    const renderedText = visibleText(nodes[0]);
    expect(details.props.authority).toEqual(authority);
    expect(renderedText).not.toContain(authority.shiftId);
    expect(renderedText).not.toContain("Check-ins");
    expect(button(nodes, "End Shift")).toBeDefined();
    expect(
      formatNativeShiftDuration(
        authority.shiftStartedAt,
        "en",
        Date.parse("2026-09-08T10:05:00.000Z"),
      ),
    ).toBe("2h 5m");
  });

  it("keeps cash input LTR and opens explicit confirmation", () => {
    const session = owner();
    const { nodes } = render(snapshot(), "ar", session);
    const input = nodes.find((node) => node.type === "TextInput")!;
    expect(input.props).toMatchObject({
      inputMode: "decimal",
      keyboardType: "decimal-pad",
      value: "10.000",
    });
    expect(JSON.stringify(input.props.style)).toContain(
      '"writingDirection":"ltr"',
    );
    (button(nodes, "إنهاء المناوبة").props.onPress as () => void)();
    expect(session.requestConfirmation).toHaveBeenCalledOnce();
  });

  it("requires confirmation and lets cancel exit without mutation", () => {
    const session = owner();
    const { nodes } = render(snapshot({ phase: "confirming" }), "en", session);
    expect(
      nodes.some(
        (node) => node.props.testID === "native-shift-end-confirmation",
      ),
    ).toBe(true);
    (button(nodes, "Confirm end shift").props.onPress as () => void)();
    (button(nodes, "Cancel").props.onPress as () => void)();
    expect(session.endShift).toHaveBeenCalledOnce();
    expect(session.cancelConfirmation).toHaveBeenCalledOnce();
  });

  it("truthfully disables mutation while offline and submitting", () => {
    const offline = render(snapshot({ online: false })).nodes;
    expect(button(offline, "End Shift").props.disabled).toBe(true);
    expect(
      JSON.stringify(offline.map((node) => node.props.children)),
    ).toContain("No network connection");
    const busy = button(
      render(snapshot({ phase: "submitting" })).nodes,
      "Ending shift...",
    );
    expect(busy.props.busy).toBe(true);
  });

  it("offers Review Tasks for the definite open-work block", () => {
    const rendered = render(snapshot({ phase: "blocked-open-work" }));
    (
      button(rendered.nodes, "Review assigned tasks").props
        .onPress as () => void
    )();
    expect(rendered.onReviewTasks).toHaveBeenCalledOnce();
    expect(
      JSON.stringify(rendered.nodes.map((node) => node.props.children)),
    ).toContain("Open work must be handed over");
  });

  it("offers only explicit same-command retry in the uncertain state", () => {
    const session = owner();
    const { nodes } = render(snapshot({ phase: "uncertain" }), "en", session);
    expect(
      nodes.some((node) => node.props.testID === "native-shift-end-uncertain"),
    ).toBe(true);
    expect(button(nodes, "End Shift").props.disabled).toBe(true);
    (button(nodes, "Retry end shift").props.onPress as () => void)();
    expect(session.retry).toHaveBeenCalledOnce();
  });

  it("shows only server reconciliation after confirmed success and safely returns", () => {
    const session = owner();
    const result = {
      cashReconciliation: {
        cashExpected: "9.000",
        cashReported: "10.000",
        cashVariance: "1.000",
        currency: "JOD",
        reportedAt: "2026-09-08T16:00:00.000Z",
      },
      endedAt: "2026-09-08T16:00:00.000Z",
      locationId: authority.locationId,
      shiftId: authority.shiftId,
      startedAt: authority.shiftStartedAt,
      status: "ENDED" as const,
    };
    const rendered = render(
      snapshot({ phase: "ended", result }),
      "en",
      session,
    );
    const serialized = JSON.stringify(rendered.nodes.map((node) => node.props));
    expect(serialized).toContain("Shift ended");
    expect(serialized).toContain("1.000 JOD");
    expect(visibleText(rendered.nodes[0])).not.toContain(authority.shiftId);
    (
      button(rendered.nodes, "Return to Start Shift").props
        .onPress as () => void
    )();
    expect(session.finish).toHaveBeenCalledOnce();
    expect(rendered.onReturned).toHaveBeenCalledOnce();
  });
});

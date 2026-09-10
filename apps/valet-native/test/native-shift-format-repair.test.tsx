import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const {
  NativeShiftSummaryDetails,
  formatNativeShiftDuration,
  presentNativeShiftStartedAt,
} = await import("../src/shift/native-shift-summary-details");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
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

describe("Native Shift Web formatter parity", () => {
  it.each([
    ["en", 5, "0h 5m"],
    ["en", 125, "2h 5m"],
    ["en", 1_443, "1d 0h 3m"],
    ["en", 1_563, "1d 2h 3m"],
    ["ar", 5, "0 س 5 د"],
    ["ar", 125, "2 س 5 د"],
    ["ar", 1_443, "1 يوم 0 س 3 د"],
    ["ar", 1_563, "1 يوم 2 س 3 د"],
  ] as const)(
    "renders %s duration at %i minutes",
    (locale, minutes, expected) => {
      expect(
        formatNativeShiftDuration(
          "2026-09-08T00:00:00.000Z",
          locale,
          Date.parse("2026-09-08T00:00:00.000Z") + minutes * 60_000,
        ),
      ).toBe(expected);
    },
  );

  it("uses the Web medium-date and short-time formatter", () => {
    const dateTimeFormat = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(function DateTimeFormat(locale, options) {
        expect(options).toEqual({
          dateStyle: "medium",
          timeStyle: "short",
        });
        return { format: () => `formatted:${String(locale)}` } as never;
      });
    try {
      expect(presentNativeShiftStartedAt(authority.shiftStartedAt, "en")).toBe(
        "formatted:en",
      );
      expect(presentNativeShiftStartedAt(authority.shiftStartedAt, "ar")).toBe(
        "formatted:ar",
      );
    } finally {
      dateTimeFormat.mockRestore();
    }
  });

  it("localizes the blue active badge independently from the green label", () => {
    const english = elements(
      NativeShiftSummaryDetails({ authority, locale: "en", textAlign: "left" }),
    );
    const arabic = elements(
      NativeShiftSummaryDetails({
        authority,
        locale: "ar",
        textAlign: "right",
      }),
    );
    expect(english.some((node) => node.props.label === "Active")).toBe(true);
    expect(arabic.some((node) => node.props.label === "نشط")).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useEffect: (effect: () => void) => effect(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Image: "Image",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));

const { NativeShiftDetachedScreen } =
  await import("../src/shift/native-shift-detached-screen");

describe("Native detached Shift-end lifecycle", () => {
  it("acknowledges the rendered authoritative success without an action", () => {
    const acknowledgeEndedPresentation = vi.fn();
    NativeShiftDetachedScreen({
      auth: {} as never,
      authSnapshot: {
        authGeneration: 1,
        phase: "authenticated",
        principal: {} as never,
      },
      locale: "en",
      onReviewTasks: vi.fn(),
      onSelectLocale: vi.fn(),
      session: { acknowledgeEndedPresentation } as never,
      snapshot: {
        authority: {
          currency: "JOD",
          identityGeneration: 1,
          locationCode: "AMM-1",
          locationId: "11111111-1111-4111-8111-111111111111",
          locationName: "Amman Hotel",
          membershipId: "22222222-2222-4222-8222-222222222222",
          organizationId: "33333333-3333-4333-8333-333333333333",
          organizationName: "VAYLET Operator",
          role: "VALET_EMPLOYEE",
          shiftId: "44444444-4444-4444-8444-444444444444",
          shiftStartedAt: "2026-09-08T08:00:00.000Z",
        },
        cashInput: "0",
        cashValidationVisible: false,
        failure: null,
        identityGeneration: 1,
        online: true,
        phase: "ended",
        result: {} as never,
      },
    });
    expect(acknowledgeEndedPresentation).toHaveBeenCalledOnce();
  });
});

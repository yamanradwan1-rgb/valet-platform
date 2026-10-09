import { beforeEach, describe, expect, it, vi } from "vitest";

const recorder = vi.hoisted(() => vi.fn());
vi.mock("../src/telemetry/native-telemetry-owner", () => ({
  getNativeTelemetry: () => ({ record: recorder }),
}));

const { recordNativePushTimingStage, recordNativePushRouteObservation } =
  await import("../src/notifications/native-push-timing-diagnostics");

beforeEach(() => recorder.mockReset());

describe("#274 privacy-safe source-to-device boundary classification", () => {
  it("marks foreground JS receipt without claiming locked-screen device receipt", () => {
    recordNativePushTimingStage("foreground-js-observed");
    recordNativePushTimingStage("notification-response-captured");
    expect(recorder.mock.calls.map(([event]) => event)).toEqual([
      { classification: "foreground-js-observed", outcome: "success", source: "push" },
      { classification: "notification-response-captured", outcome: "success", source: "push" },
    ]);
  });

  it("records only bounded stage and duration, never an identifier", () => {
    recordNativePushRouteObservation({ kind: "route-held" });
    recordNativePushRouteObservation({ kind: "canonical-refresh-succeeded", durationMs: 75_000 });
    recordNativePushRouteObservation({ kind: "canonical-refresh-failed", durationMs: NaN });
    recordNativePushRouteObservation({ kind: "route-dropped" });
    const observations = recorder.mock.calls.map(([event]) => event);
    expect(observations).toHaveLength(4);
    expect(observations[1]).toMatchObject({
      classification: "canonical-refresh-succeeded", durationMs: 60_000, outcome: "success",
    });
    expect(observations[2]).not.toHaveProperty("durationMs");
    for (const event of observations) {
      expect(Object.keys(event).sort()).toEqual(
        Object.keys(event).includes("durationMs")
          ? ["classification", "durationMs", "outcome", "source"]
          : ["classification", "outcome", "source"],
      );
      expect(JSON.stringify(event)).not.toContain("intentId");
    }
  });
});

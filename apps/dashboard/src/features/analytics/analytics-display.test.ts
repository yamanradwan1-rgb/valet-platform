import { describe, expect, it } from "vitest";

import {
  formatCurrencyAmount,
  formatDurationAverage,
  formatIncidentsPer1000Value,
  formatQueueAgeSeconds,
  formatRatePercentage,
  formatRateRatio,
  handledBarPercent,
  humanizeIncidentType,
  maxHandledCount,
} from "./analytics-display";
import { canRetry, errorMessageKey } from "./analytics-view";
import {
  DashboardApiError,
  mapNetworkError,
  type DashboardApiFailureKind,
} from "../../lib/api/api-error";

describe("analytics rate rendering (backend-owned formulas)", () => {
  it("renders backend percentage strings verbatim", () => {
    expect(
      formatRatePercentage(
        { denominator: 80, numerator: 52, percentage: "65.00" },
        "—",
      ),
    ).toBe("65.00%");
    expect(
      formatRatePercentage(
        { denominator: 2, numerator: 2, percentage: "100.00" },
        "—",
      ),
    ).toBe("100.00%");
  });

  it("renders a null percentage as the honest unavailable label — never 0%", () => {
    expect(
      formatRatePercentage({ denominator: 78, numerator: 36, percentage: null }, "—"),
    ).toBe("—");
    expect(
      formatRatePercentage({ denominator: 0, numerator: 0, percentage: null }, "n/a"),
    ).toBe("n/a");
  });

  it("shows numerator/denominator facts alongside rates", () => {
    expect(formatRateRatio({ denominator: 118, numerator: 4, percentage: null })).toBe(
      "4 / 118",
    );
  });

  it("renders incidents per 1000 values verbatim or as an honest em dash", () => {
    expect(formatIncidentsPer1000Value("33.898", "—")).toBe("33.898");
    expect(formatIncidentsPer1000Value(null, "—")).toBe("—");
  });
});

describe("analytics duration and age display", () => {
  it("renders backend duration strings verbatim with unit suffix; null stays null-honest", () => {
    expect(formatDurationAverage({ averageSeconds: "17.542", sampleCount: 118 }, "—")).toBe(
      "17.542s",
    );
    expect(formatDurationAverage({ averageSeconds: null, sampleCount: 0 }, "—")).toBe("—");
  });

  it("formats queue age for display only; null renders unavailable", () => {
    const units = { minutes: "m", seconds: "s" };
    expect(formatQueueAgeSeconds(null, "—", units)).toBe("—");
    expect(formatQueueAgeSeconds("486.000", "—", units)).toBe("8m 6s");
    expect(formatQueueAgeSeconds("42.750", "—", units)).toBe("42s");
  });
});

describe("analytics money display (strings only)", () => {
  it("concatenates currency with exact amount strings", () => {
    expect(formatCurrencyAmount("JOD", "1140.000")).toBe("JOD 1140.000");
    expect(formatCurrencyAmount("JOD", "-5.000")).toBe("JOD -5.000");
  });
});

describe("cars-handled bar scaling (presentation-only derivation)", () => {
  it("scales bars against the max of their own series", () => {
    const entries = [{ handledCount: 14 }, { handledCount: 28 }];
    expect(maxHandledCount(entries)).toBe(28);
    expect(handledBarPercent(14, 28)).toBe(50);
    expect(handledBarPercent(28, 28)).toBe(100);
  });

  it("handles all-zero series, a single value and an empty series without NaN", () => {
    // All zeros: max is 0, every width collapses to 0% (never NaN/Infinity).
    const allZero = [{ handledCount: 0 }, { handledCount: 0 }];
    expect(maxHandledCount(allZero)).toBe(0);
    for (const entry of allZero) {
      const width = handledBarPercent(entry.handledCount, 0);
      expect(Number.isFinite(width)).toBe(true);
      expect(width).toBe(0);
    }
    // One value equals the max → full width.
    expect(handledBarPercent(7, 7)).toBe(100);
    // Empty series renders no rows; scale helpers stay finite.
    expect(maxHandledCount([])).toBe(0);
    expect(Number.isFinite(handledBarPercent(0, 0))).toBe(true);
  });
});

describe("incident type display (conservative, lossless)", () => {
  it("widens only underscore separators in ALL-CAPS machine tokens", () => {
    expect(humanizeIncidentType("PROPERTY_DAMAGE")).toBe("PROPERTY DAMAGE");
    expect(humanizeIncidentType("KEY_MISSING")).toBe("KEY MISSING");
  });

  it("never degrades acronyms like VIP", () => {
    expect(humanizeIncidentType("VIP")).toBe("VIP");
    expect(humanizeIncidentType("QR_LOSS")).toBe("QR LOSS");
  });

  it("passes already-human text through untouched", () => {
    expect(humanizeIncidentType("Customer complaint")).toBe(
      "Customer complaint",
    );
    expect(humanizeIncidentType("key missing")).toBe("key missing");
  });

  it("renders blank values as an em dash", () => {
    expect(humanizeIncidentType("   ")).toBe("—");
  });
});

describe("analytics error semantics (§15)", () => {
  function errorOf(
    kind: DashboardApiFailureKind,
    code: string,
    isNetworkError = false,
  ): DashboardApiError {
    return new DashboardApiError({
      kind,
      status: 0,
      code,
      message: "x",
      isNetworkError,
    });
  }

  it("maps masked 404 and forbidden to access-denied without retry", () => {
    for (const kind of ["authorization-masked", "forbidden"] as const) {
      const error = errorOf(kind, "LOCATION_ACCESS_DENIED");
      expect(errorMessageKey(error)).toBe("analytics.error.accessDenied");
      expect(canRetry(error)).toBe(false);
    }
  });

  it("never offers retry for a finished session", () => {
    const error = new DashboardApiError({
      kind: "session-expired",
      status: 401,
      code: "STAFF_AUTHENTICATION_FAILED",
      message: "expired",
    });
    expect(canRetry(error)).toBe(false);
  });

  it("maps network failures to the network message with retry", () => {
    const error = mapNetworkError();
    expect(errorMessageKey(error)).toBe("analytics.error.network");
    expect(canRetry(error)).toBe(true);
  });

  it("maps server/schema-drift/rate-limit failures to load-failed with retry", () => {
    for (const kind of ["server", "rate-limited", "validation"] as const) {
      const error = errorOf(kind, "ANY_BACKEND_CODE");
      expect(errorMessageKey(error)).toBe("analytics.error.loadFailed");
      expect(canRetry(error)).toBe(true);
    }
  });
});

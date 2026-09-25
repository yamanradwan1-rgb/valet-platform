import { describe, expect, it } from "vitest";

import { formatOverviewDuration } from "./overview-duration";

describe("Overview human duration", () => {
  it("keeps unavailable separate from measured zero", () => {
    expect(formatOverviewDuration(null, "en")).toBe("Unavailable");
    expect(formatOverviewDuration("0.000", "en")).toBe("0 seconds");
    expect(formatOverviewDuration(null, "ar")).toBe("غير متاح");
  });

  it("humanizes seconds without noisy precision", () => {
    expect(formatOverviewDuration("45.000", "en")).toBe("45 seconds");
    expect(formatOverviewDuration("45.000", "en", "compact")).toBe("45s");
    expect(formatOverviewDuration("0.125", "en")).toBe("0.125s");
    expect(formatOverviewDuration("640.000", "en")).toBe("10m 40s");
    expect(formatOverviewDuration("61.500", "en")).toBe("1m 1.5s");
    expect(formatOverviewDuration("4320.000", "en")).toBe("1h 12m");
    expect(formatOverviewDuration("4027197.232", "en")).toBe("46d 14h");
  });

  it("uses localized numerals and units for Arabic", () => {
    expect(formatOverviewDuration("45.000", "ar")).toBe("٤٥ ثانية");
    expect(formatOverviewDuration("45.000", "ar", "compact")).toBe("٤٥ ث");
    expect(formatOverviewDuration("640.000", "ar")).toBe("١٠ د ٤٠ ث");
    expect(formatOverviewDuration("0.125", "ar")).toBe("٠٫١٢٥ ثانية");
  });
});

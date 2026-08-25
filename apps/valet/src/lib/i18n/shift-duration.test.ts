import { describe, expect, it } from "vitest";

import {
  formatShiftDuration,
} from "./live-presentation";

describe("VUI-011A Shift elapsed duration presentation", () => {
  it("formats compact hours/minutes under 24 hours in English", () => {
    expect(formatShiftDuration(7 * 3600 + 39 * 60, "en")).toBe("7h 39m");
    expect(formatShiftDuration(0, "en")).toBe("0h 0m");
  });

  it("formats days + hours + minutes at or beyond 24 hours in English", () => {
    const seconds = 16 * 86400 + 7 * 3600 + 39 * 60;
    expect(formatShiftDuration(seconds, "en")).toBe("16d 7h 39m");
  });

  it("formats natural Arabic output including beyond 24 hours", () => {
    expect(formatShiftDuration(7 * 3600 + 39 * 60, "ar")).toBe("7 س 39 د");
    const seconds = 16 * 86400 + 7 * 3600 + 39 * 60;
    expect(formatShiftDuration(seconds, "ar")).toBe("16 يوم 7 س 39 د");
  });

  it("honours dictionary-provided unit labels over defaults", () => {
    expect(formatShiftDuration(3661, "en", { day: "D", hour: "H", minute: "M" })).toBe("1H 1M");
    expect(
      formatShiftDuration(90061, "en", { day: "D", hour: "H", minute: "M" }),
    ).toBe("1D 1H 1M");
  });

  it("never renders negative durations for clock skew", () => {
    expect(formatShiftDuration(-5, "en")).toBe("0h 0m");
  });
});

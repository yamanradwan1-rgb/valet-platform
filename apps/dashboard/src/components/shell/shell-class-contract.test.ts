import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Shell/CSS class contract (D5-001).
 *
 * WHY source invariants: className strings resolve against authored CSS at
 * runtime only, which the node test environment never executes. Two audited
 * defects are pinned here:
 *
 * 1. The nav toggle referenced `lg-only-hidden`, a class defined NOWHERE;
 *    the hamburger therefore never hid on >=1024px viewports, and clicking
 *    it locked body scroll while every visible dismissal was display:none.
 * 2. `.skeleton` / `.skeleton-line` back the shared <Skeleton> primitive
 *    used by every loading state; without definitions the loading posture
 *    rendered as blank pixels with no perceivable fetch feedback.
 */

const TOP_BAR_SOURCE = readFileSync(
  new URL("./top-bar.tsx", import.meta.url),
  "utf8",
);

const GLOBALS_CSS = readFileSync(
  new URL("../../app/globals.css", import.meta.url),
  "utf8",
);

describe("nav toggle desktop visibility", () => {
  it("uses the defined lg-desktop-hidden class and nothing similar", () => {
    expect(TOP_BAR_SOURCE.includes("lg-desktop-hidden")).toBe(true);
    expect(TOP_BAR_SOURCE.includes("lg-only-hidden")).toBe(false);
    expect(
      /\.topbar-icon-button\.lg-desktop-hidden\b/u.test(GLOBALS_CSS),
    ).toBe(true);
  });
});

describe("shared skeleton styles exist", () => {
  it("defines .skeleton and .skeleton-line in authored CSS", () => {
    expect(GLOBALS_CSS.includes(".skeleton {")).toBe(true);
    expect(GLOBALS_CSS.includes(".skeleton-line {")).toBe(true);
  });
});

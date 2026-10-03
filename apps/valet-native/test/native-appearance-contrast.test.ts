import { describe, expect, it } from "vitest";
import {
  employeeDarkPalette as p,
  employeeStatusPalette,
} from "../src/appearance/employee-palette";

function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}
describe("deliberate Dark semantic contrast", () => {
  it("keeps input boundaries and operational status dots visible", () => {
    for (const bg of [p.appBackground, p.surface, p.inputSurface])
      expect(contrast(p.border, bg), bg).toBeGreaterThanOrEqual(3);
    expect(contrast(p.success, p.inverseRaised)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.success, p.successSurface)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.danger, p.dangerSurface)).toBeGreaterThanOrEqual(3);
  });
  it("keeps normal copy, action labels and status meaning readable", () => {
    for (const bg of [p.appBackground, p.surface, p.inputSurface])
      for (const fg of [
        p.textPrimary,
        p.textSecondary,
        p.textMuted,
        p.linkPrimary,
      ])
        expect(contrast(fg, bg), `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const bg of [
      p.actionPrimary,
      p.primaryPressed,
      p.actionSuccess,
      p.actionDanger,
      p.actionWarning,
      p.inverseSurface,
    ])
      expect(contrast(p.onAction, bg), bg).toBeGreaterThanOrEqual(4.5);
    for (const status of Object.values(employeeStatusPalette(p)))
      expect(
        contrast(status.color, status.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.disabledText, p.disabledSurface)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

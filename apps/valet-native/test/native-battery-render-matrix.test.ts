import { describe, expect, it } from "vitest";

import { employeePalettes } from "../src/appearance/employee-palette";
import { nativeBatteryCopy } from "../src/notifications/native-battery-copy";
import { appearanceRenderer, appearanceGeometry } from "./appearance-render-evidence";

function luminance(hex: string): number {
  const components = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return components[0]! * .2126 + components[1]! * .7152 + components[2]! * .0722;
}

function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((first, second) => second - first);
  return (values[0]! + .05) / (values[1]! + .05);
}

const modulePath = "notifications/native-battery-warning";
function render(mode: "light" | "dark", locale: "en" | "ar", status: string) {
  return appearanceRenderer(mode).render(modulePath, "NativeBatteryNotice", {
    locale,
    onOpenSettings: () => undefined,
    status,
  });
}

describe("#274 non-device render evidence: EN/AR x Light/Dark at 320px", () => {
  it.each(["en", "ar"] as const)("does not create configured/checking/unknown/unsupported pixels in %s", (locale) => {
    for (const mode of ["light", "dark"] as const) {
      for (const status of ["configured", "checking", "unknown", "unsupported"]) {
        expect(render(mode, locale, status), `${mode}/${locale}/${status}`).toBeNull();
      }
    }
  });

  it.each(["en", "ar"] as const)("preserves restricted warning geometry in Light/Dark %s", (locale) => {
    const day = render("light", locale, "restricted");
    const night = render("dark", locale, "restricted");
    expect(day).not.toBeNull();
    expect(appearanceGeometry(night)).toEqual(appearanceGeometry(day));
    const content = JSON.stringify(day);
    for (const copy of Object.values(nativeBatteryCopy[locale])) expect(content).toContain(copy);
    expect(content).toContain("native-battery-warning");
  });

  it("reuses readable normal-text tokens across both palettes", () => {
    for (const palette of Object.values(employeePalettes)) {
      expect(contrast(palette.textPrimary, palette.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

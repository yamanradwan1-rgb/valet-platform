import { describe, expect, it, vi } from "vitest";
import {
  appearanceRenderer,
  appearanceGeometry,
  uncoloredAppearanceText,
} from "./appearance-render-evidence";
import { shellRenderCases } from "./appearance-render-cases";
import { workflowRenderCases } from "./appearance-workflow-cases";

describe("Native EN/AR appearance render matrix at 320px host width", () => {
  it.each(["en", "ar"] as const)(
    "freezes Light against pushed #226 and Dark geometry in %s",
    (locale) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
      const baseline = appearanceRenderer("light", true);
      const light = appearanceRenderer("light");
      const dark = appearanceRenderer("dark");
      const uncolored: string[] = [];
      for (const c of [...shellRenderCases, ...workflowRenderCases]) {
        const before = baseline.render(
          c.file,
          c.component,
          c.props(baseline, locale),
          true,
        );
        const after = light.render(
          c.file,
          c.component,
          c.props(light, locale),
          true,
        );
        const night = dark.render(
          c.file,
          c.component,
          c.props(dark, locale),
          true,
        );
        expect(after, `${c.name} Light/${locale}`).toEqual(before);
        expect(after, `${c.name} nonempty`).not.toBeNull();
        expect(
          appearanceGeometry(night),
          `${c.name} Dark geometry/${locale}`,
        ).toEqual(appearanceGeometry(after));
        uncolored.push(
          ...uncoloredAppearanceText(night).map((text) => `${c.name}: ${text}`),
        );
      }
      expect(uncolored).toEqual([]);
      vi.useRealTimers();
    },
  );
});

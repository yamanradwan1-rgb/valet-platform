import { describe, expect, it, vi } from "vitest";
import {
  appearanceRenderer,
  appearanceGeometry,
  uncoloredAppearanceText,
} from "./appearance-render-evidence";
import { shellRenderCases } from "./appearance-render-cases";
import { workflowRenderCases } from "./appearance-workflow-cases";

type RenderNode = { type: unknown; props: Record<string, unknown> };

function normalizeIssue265LightHeader(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeIssue265LightHeader);
  if (!value || typeof value !== "object") return value;
  const node = value as Partial<RenderNode>;
  if (!node.props) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeIssue265LightHeader(entry),
      ]),
    );
  }
  if (node.props.testID === "employee-header-logo-slot") {
    const image = node.props.children as RenderNode;
    const slot = node.props.style as {
      flexShrink: number;
      height: number;
      width: number;
    };
    return {
      type: image.type,
      props: {
        ...image.props,
        style: {
          aspectRatio: 169 / 60,
          flexShrink: slot.flexShrink,
          height: slot.height,
        },
      },
    };
  }
  return {
    ...node,
    props: Object.fromEntries(
      Object.entries(node.props).map(([key, entry]) => [
        key,
        normalizeIssue265LightHeader(entry),
      ]),
    ),
  };
}

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
        expect(
          c.name === "shell header"
            ? normalizeIssue265LightHeader(after)
            : after,
          `${c.name} Light/${locale}`,
        ).toEqual(before);
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

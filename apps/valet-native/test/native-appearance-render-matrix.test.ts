import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appearanceRenderer,
  appearanceGeometry,
  uncoloredAppearanceText,
} from "./appearance-render-evidence";
import { scope, shellRenderCases } from "./appearance-render-cases";
import { workflowRenderCases } from "./appearance-workflow-cases";

type RenderNode = { type: unknown; props: Record<string, unknown> };

function renderCaseProps(
  c: (typeof shellRenderCases)[number],
  renderer: ReturnType<typeof appearanceRenderer>,
  locale: "en" | "ar",
): Record<string, unknown> {
  const props = c.props(renderer, locale);
  if (c.file !== "check-in/native-check-in-workflow") return props;
  // Render the real Check-In tree with inert, valid auth/scope context. The
  // photo owner's effects do not run and no HTTP or filesystem IO occurs.
  return {
    ...props,
    auth: { current: () => ({ authGeneration: 1 }) },
    scope,
  };
}

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

// Shift Presence explicitly sets the active cash field to editable=true;
// React Native already defaults TextInput to editable. This is a behavior
// guard, not a Light appearance or geometry change from the #226 baseline.
function normalizeActiveShiftCashEditability(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(normalizeActiveShiftCashEditability);
  if (!value || typeof value !== "object") return value;
  const node = value as Partial<RenderNode>;
  if (!node.props) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeActiveShiftCashEditability(entry),
      ]),
    );
  }
  const activeCashInput =
    node.type === "TextInput" &&
    node.props.inputMode === "decimal" &&
    node.props.keyboardType === "decimal-pad";
  if (activeCashInput) {
    expect(
      node.props.editable,
      "active Shift cash field remains editable",
    ).toBe(true);
  }
  return {
    ...node,
    props: Object.fromEntries(
      Object.entries(node.props)
        .filter(([key]) => !activeCashInput || key !== "editable")
        .map(([key, entry]) => [
          key,
          normalizeActiveShiftCashEditability(entry),
        ]),
    ),
  };
}

// The approved verified-photo workflow adds a policy-loading message to the
// existing Check-In notice. Match that exact new state, then compare the
// unchanged notice container and text styling against pushed Light geometry.
function normalizeConditionPhotoLoading(
  value: unknown,
  locale: "en" | "ar",
): unknown {
  if (Array.isArray(value))
    return value.map((entry) => normalizeConditionPhotoLoading(entry, locale));
  if (!value || typeof value !== "object") return value;
  const node = value as Partial<RenderNode>;
  if (!node.props) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeConditionPhotoLoading(entry, locale),
      ]),
    );
  }
  const children = node.props.children;
  if (
    node.type === "View" &&
    Array.isArray(children) &&
    children.length === 1 &&
    (children[0] as RenderNode).props?.accessibilityLiveRegion === "polite"
  ) {
    const status = children[0] as RenderNode;
    expect(status.type).toBe("Text");
    expect(status.props.children).toBe(
      locale === "ar"
        ? "جارٍ التحقق من متطلبات الصور…"
        : "Checking photo requirements…",
    );
    return {
      ...node,
      props: {
        ...node.props,
        children: {
          type: "Text",
          props: {
            children:
              locale === "ar"
                ? "الصور اختيارية وفق سياسة الموقع"
                : "Photos optional by location policy",
            style: {
              ...(status.props.style as Record<string, unknown>),
              writingDirection: locale === "ar" ? "rtl" : "ltr",
            },
          },
        },
      },
    };
  }
  return {
    ...node,
    props: Object.fromEntries(
      Object.entries(node.props).map(([key, entry]) => [
        key,
        normalizeConditionPhotoLoading(entry, locale),
      ]),
    ),
  };
}

describe("Native EN/AR appearance render matrix at 320px host width", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(["en", "ar"] as const)(
    "freezes Light against pushed #226 and Dark geometry in %s",
    (locale) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
      vi.stubGlobal("__DEV__", false);
      vi.stubEnv("EXPO_PUBLIC_API_ORIGIN", "https://appearance-render.invalid");
      const baseline = appearanceRenderer("light", true);
      const light = appearanceRenderer("light");
      const dark = appearanceRenderer("dark");
      const uncolored: string[] = [];
      for (const c of [...shellRenderCases, ...workflowRenderCases]) {
        const before = baseline.render(
          c.file,
          c.component,
          renderCaseProps(c, baseline, locale),
          true,
        );
        const after = light.render(
          c.file,
          c.component,
          renderCaseProps(c, light, locale),
          true,
        );
        const night = dark.render(
          c.file,
          c.component,
          renderCaseProps(c, dark, locale),
          true,
        );
        expect(
          c.name === "shell header"
            ? normalizeIssue265LightHeader(after)
            : c.name === "Shift"
              ? normalizeActiveShiftCashEditability(after)
              : c.name === "condition"
                ? normalizeConditionPhotoLoading(after, locale)
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
    },
  );
});

import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { appearanceRenderer } from "./appearance-render-evidence";
import { appearanceNodes } from "./appearance-render-tree";
import { getNativePresenceCopy } from "../src/shift/native-shift-presence-copy";
import type {
  PresenceCheckStatus,
  PresenceSnapshot,
} from "@valet/employee-client";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T10:30:00Z"));
});
afterEach(() => vi.useRealTimers());

const base = "a33717b197580d0ba48a9b3d56068841140c28ad";
const authority = {
  identityGeneration: 1,
  organizationId: "org",
  organizationName: "Operator",
  membershipId: "member",
  locationId: "location",
  locationCode: "AMM",
  locationName: "Amman",
  shiftId: "shift",
  shiftStartedAt: "2026-10-04T10:00:00Z",
  currency: "JOD",
  role: "VALET_EMPLOYEE",
};
const result = {
  status: "ENDED",
  shiftId: "shift",
  locationId: "location",
  startedAt: authority.shiftStartedAt,
  endedAt: "2026-10-04T11:00:00Z",
  cashReconciliation: {
    cashReported: "865.000",
    cashExpected: "865.000",
    cashVariance: "0.000",
    currency: "JOD",
    reportedAt: "2026-10-04T11:00:00Z",
  },
};
const cases = [
  ["ACTIVE", "active", "idle", undefined],
  ["CONFIRMING", "confirming", "idle", undefined],
  ["SUBMITTING", "submitting", "submitting", undefined],
  ["UNCERTAIN", "uncertain", "uncertain", undefined],
  ["CHECKING STATUS", "uncertain", "uncertain", "checking"],
  ["DENIED", "active", "denied", "denied"],
  ["EXPIRED", "active", "expired", "expired"],
  ["PENDING", "uncertain", "uncertain", "pending"],
  ["ENDED", "ended", "confirmed", undefined],
] as const;
function props(
  locale: "en" | "ar",
  parentPhase: string,
  phase: string,
  checkStatus?: string,
) {
  const snapshot = {
    authority,
    identityGeneration: 1,
    online: true,
    phase: parentPhase,
    cashInput: "865.000",
    cashValidationVisible: false,
    failure: null,
    result: parentPhase === "ended" ? result : null,
  };
  const presence = {
    snapshot: () => ({
      phase,
      checkStatus,
      mode: phase === "uncertain" ? "OFF" : "REQUIRE",
      reason: null,
      summary: null,
      overrideReason: null,
      retryAfter: null,
    }),
    subscribe: () => () => undefined,
  };
  return {
    locale,
    textAlign: locale === "ar" ? "right" : "left",
    snapshot,
    session: { presence },
    onReviewTasks: () => undefined,
  };
}
function render(
  renderer: ReturnType<typeof appearanceRenderer>,
  p: ReturnType<typeof props>,
) {
  return renderer.render(
    "shift/native-active-shift-panel",
    "NativeActiveShiftPanel",
    p,
  );
}
function omitFeedback(tree: unknown): unknown {
  if (Array.isArray(tree))
    return tree.map(omitFeedback).filter((v) => v !== null);
  if (tree === null || typeof tree !== "object") return tree;
  const node = tree as { props?: Record<string, unknown> };
  if (node.props?.testID === "native-shift-presence-status") return null;
  return Object.fromEntries(
    Object.entries(tree).map(([k, v]) => [k, omitFeedback(v)]),
  );
}

it("compares complete Shift trees against exact base across EN/AR, themes, widths and font scales", () => {
  const comparisons: unknown[] = [];
  for (const locale of ["en", "ar"] as const)
    for (const mode of ["light", "dark"] as const)
      for (const width of [320, 390])
        for (const fontScale of [1, 1.5]) {
          const evidence = { baselineRef: base, width, fontScale };
          const before = appearanceRenderer(mode, true, undefined, evidence);
          const after = appearanceRenderer(mode, false, undefined, evidence);
          for (const [name, parent, phase, status] of cases) {
            const oldTree = render(
              before,
              props(locale, parent, phase, status),
            );
            const newTree = render(after, props(locale, parent, phase, status));
            if (["ACTIVE", "CONFIRMING", "SUBMITTING", "ENDED"].includes(name))
              expect(newTree).toEqual(oldTree);
            else if (name !== "CHECKING STATUS")
              expect(omitFeedback(newTree)).toEqual(omitFeedback(oldTree));
            const nodes = appearanceNodes(newTree);
            const input = nodes.find((n) => n.type === "TextInput");
            if (input)
              expect(
                (input.props.style as Record<string, unknown>).writingDirection,
              ).toBe("ltr");
            const live = nodes.find(
              (n) =>
                n.props.accessibilityLiveRegion === "polite" &&
                n.type === "Text",
            );
            if (name === "CHECKING STATUS") {
              expect(live?.props.accessibilityState).toEqual({ busy: true });
              const buttons = nodes.filter((n) => n.type === "Pressable");
              expect(
                buttons.filter(
                  (n) =>
                    (n.props.accessibilityState as { busy?: boolean })?.busy,
                ),
              ).toHaveLength(2);
            }
            comparisons.push({
              locale,
              mode,
              width,
              fontScale,
              state: name,
              beforeHash: createHash("sha256")
                .update(JSON.stringify(oldTree))
                .digest("hex"),
              afterHash: createHash("sha256")
                .update(JSON.stringify(newTree))
                .digest("hex"),
              feedback: live?.props.children ?? null,
              comparison: [
                "ACTIVE",
                "CONFIRMING",
                "SUBMITTING",
                "ENDED",
              ].includes(name)
                ? "identical"
                : "bounded feedback/busy availability",
            });
          }
        }
  const output = resolve(
    "../../docs/validation/issue-345/render-comparison.json",
  );
  mkdirSync(resolve(output, ".."), { recursive: true });
  writeFileSync(
    output,
    JSON.stringify(
      {
        base,
        kind: "Resolved React Native host trees; no Android layout engine",
        comparisons,
      },
      null,
      2,
    ) + "\n",
  );
});

it.each(["en", "ar"] as const)(
  "publishes every localized status in %s with matching typography and accessible busy state",
  (locale) => {
    const renderer = appearanceRenderer("dark");
    const copy = getNativePresenceCopy(locale);
    for (const status of [
      "checking",
      "committed",
      "unresolved",
      "no-attempt",
      "blocked",
      "rate-limited",
      "offline",
      "error",
      "context-required",
    ] as PresenceCheckStatus[]) {
      const snapshot: PresenceSnapshot = {
        phase: "uncertain",
        mode: "OFF",
        checkStatus: status,
        reason: null,
        summary: null,
        overrideReason: null,
        retryAfter: null,
      };
      const tree = renderer.render(
        "shift/native-shift-presence-status",
        "NativeShiftPresenceStatus",
        {
          locale,
          session: { snapshot: () => snapshot },
          recoveryPending: true,
          onCheck: () => undefined,
          onContinue: () => undefined,
          onCancel: () => undefined,
        },
      );
      const nodes = appearanceNodes(tree);
      const text = nodes.find((n) => n.type === "Text")!;
      expect(text.props.children).toBe(
        status === "context-required"
          ? `${copy.uncertain} ${copy.contextRequired}`
          : copy.checkFeedback[status as keyof typeof copy.checkFeedback],
      );
      expect(text.props.accessibilityLiveRegion).toBe("polite");
      expect((text.props.style as Record<string, unknown>).textAlign).toBe(
        locale === "ar" ? "right" : "left",
      );
      expect(text.props.numberOfLines).toBeUndefined();
      const button = nodes.find((n) => n.type === "Pressable")!;
      expect(button.props.accessibilityState).toEqual(
        status === "checking"
          ? { busy: true, disabled: true }
          : { disabled: false },
      );
    }
  },
);

it("missing END descriptor under OFF keeps parent-aware recovery accessible", () => {
  const renderer = appearanceRenderer("light");
  const onCheck = vi.fn();
  const childCheck = vi.fn();
  const tree = renderer.render(
    "shift/native-shift-presence-status",
    "NativeShiftPresenceStatus",
    {
      locale: "en",
      recoveryPending: true,
      onCheck,
      onContinue: vi.fn(),
      onCancel: vi.fn(),
      session: {
        snapshot: () => ({
          phase: "idle",
          mode: "OFF",
          reason: null,
          summary: null,
          overrideReason: null,
          retryAfter: null,
        }),
        checkStatus: childCheck,
      },
    },
    false,
    true,
  );
  const nodes = appearanceNodes(tree);
  expect(nodes.find((n) => n.type === "Text")?.props.children).toContain(
    "No recoverable request",
  );
  const button = nodes.find((n) => n.type === "Pressable")!;
  (button.props.onPress as () => void)();
  expect(onCheck).toHaveBeenCalledOnce();
  expect(childCheck).not.toHaveBeenCalled();
});

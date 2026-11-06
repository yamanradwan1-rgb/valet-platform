import type { StaffTaskQueueItem } from "@valet/employee-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appearanceRenderer } from "./appearance-render-evidence";
import { appearanceNodes } from "./appearance-render-tree";
import { operations } from "./production-shell-test-fixture";

// Freshly fetched origin/main for #436: compare complete resolved host trees.
const baselineRef = "1d0f5b3563b876e3bc5e687bad779f9bb8e0b965";
const task: StaffTaskQueueItem = {
  createdAt: "2026-09-03T08:05:00.000Z",
  currentAssigneeMembershipId: null,
  parkingSpot: "A-12",
  parkingZone: "North",
  retrievalRequestedAt: "2026-09-03T08:05:00.000Z",
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "QUEUED",
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "RETRIEVAL",
  valetSessionState: "REQUESTED",
  valetSessionVersion: 1,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
  version: 1,
};

function withoutLocation(value: unknown, location: string | null): unknown {
  if (Array.isArray(value))
    return value
      .filter((entry) => !location || entry?.props?.children !== location)
      .map((entry) => withoutLocation(entry, location));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      withoutLocation(entry, location),
    ]),
  );
}

describe.each(["light", "dark"] as const)("priority location in %s", (mode) => {
  afterEach(() => vi.useRealTimers());

  it.each(["en", "ar"] as const)(
    "adds only authorized Retrieval location and preserves the queue row in %s",
    (locale) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-03T08:06:05Z"));
      const current = appearanceRenderer(mode);
      const baseline = appearanceRenderer(mode, true, undefined, {
        baselineRef,
      });
      const copy = (
        current.load("tasks/native-tasks-copy").getNativeTasksCopy as (
          locale: string,
        ) => Record<string, string>
      )(locale);
      for (const [taskType, parkingZone, parkingSpot, location] of [
        ["RETRIEVAL", "North", "A-12", "North · A-12"],
        ["RETRIEVAL", "North", null, "North"],
        ["RETRIEVAL", null, "A-12", "A-12"],
        ["RETRIEVAL", null, null, null],
        ["RETRIEVAL", " ", "", null],
        ["PARKING", "North", "A-12", null],
      ] as const) {
        const onAction = vi.fn();
        const props = {
          busy: false,
          copy,
          locale,
          onAction,
          onOverrideHandoff: vi.fn(),
          snapshot: operations("ready"),
          task: { ...task, taskType, parkingZone, parkingSpot },
          textAlign: locale === "ar" ? "right" : "left",
        };
        const file = "tasks/native-task-card";
        const after = current.render(file, "NativeTaskCard", props);
        const nodes = appearanceNodes(after);
        const locationNodes = nodes.filter((node) =>
          ["North · A-12", "North", "A-12"].includes(
            String(node.props.children),
          ),
        );
        expect(locationNodes).toHaveLength(location ? 1 : 0);
        if (location) {
          const line = locationNodes[0]!;
          expect(line.type).toBe("Text");
          expect(line.props.children).toBe(location);
          const time = nodes.find((node) =>
            String(node.props.children).startsWith(copy.requested!),
          )!;
          expect(line.props.style).toEqual(time.props.style);
          expect(line.props.style).toMatchObject({
            textAlign: props.textAlign,
            writingDirection: locale === "ar" ? "rtl" : "ltr",
          });
          const siblings = nodes.find(
            (node) =>
              Array.isArray(node.props.children) &&
              node.props.children.includes(line),
          )!.props.children as unknown[];
          expect(siblings.indexOf(line)).toBe(siblings.indexOf(time) + 1);
        }
        expect(withoutLocation(after, location)).toEqual(
          baseline.render(file, "NativeTaskCard", props),
        );
        expect(
          current.render(
            "tasks/native-task-queue-row",
            "NativeTaskQueueRow",
            props,
          ),
        ).toEqual(
          baseline.render(
            "tasks/native-task-queue-row",
            "NativeTaskQueueRow",
            props,
          ),
        );
        const interactive = appearanceNodes(
          current.render(file, "NativeTaskCard", props, false, true),
        );
        const root = interactive.find(
          (node) => node.props.testID === "native-priority-task",
        )!;
        expect(root.props).toMatchObject({
          accessibilityRole: "button",
          accessibilityState: { busy: false, disabled: false },
        });
        expect(root.props.accessibilityLabel).toBeUndefined();
        expect(
          nodes.some(
            (node) =>
              node.props.children === "12-34567" &&
              (node.props.style as Record<string, unknown>).writingDirection ===
                "ltr",
          ),
        ).toBe(true);
        (root.props.onPress as () => void)();
        expect(onAction).toHaveBeenCalledOnce();
      }
    },
    // Cold Git-baseline transpilation uses the existing appearance suite budget.
    15_000,
  );

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)(
    "preserves assigned-other and busy handoff controls for %s",
    (role) => {
      vi.useFakeTimers();
      const current = appearanceRenderer(mode);
      const baseline = appearanceRenderer(mode, true, undefined, {
        baselineRef,
      });
      const copy = (
        current.load("tasks/native-tasks-copy").getNativeTasksCopy as (
          locale: string,
        ) => Record<string, string>
      )("en");
      for (const busy of [false, true]) {
        const onAction = vi.fn();
        const onOverrideHandoff = vi.fn();
        const snapshot = operations("ready");
        const props = {
          busy,
          copy,
          locale: "en",
          onAction,
          onOverrideHandoff,
          snapshot: { ...snapshot, scope: { ...snapshot.scope!, role } },
          task: {
            ...task,
            currentAssigneeMembershipId: "other-member",
            status: "IN_PROGRESS",
            valetSessionState: "HANDOFF_PENDING",
          },
          textAlign: "left",
        };
        const file = "tasks/native-task-card";
        expect(
          withoutLocation(
            current.render(file, "NativeTaskCard", props),
            "North · A-12",
          ),
        ).toEqual(baseline.render(file, "NativeTaskCard", props));
        const nodes = appearanceNodes(
          current.render(file, "NativeTaskCard", props, false, true),
        );
        const root = nodes.find(
          (node) => node.props.testID === "native-priority-task",
        )!;
        expect(root.type).toBe("View");
        expect(root.props.onPress).toBeUndefined();
        const button = nodes.find((node) => node.type === "Pressable")!;
        expect(button.props.disabled).toBe(busy || role === "VALET_EMPLOYEE");
        if (!busy && role === "VALET_SUPERVISOR") {
          const stopPropagation = vi.fn();
          (button.props.onPress as (event: unknown) => void)({
            stopPropagation,
          });
          expect(stopPropagation).toHaveBeenCalledOnce();
          expect(onOverrideHandoff).toHaveBeenCalledOnce();
        }
        expect(onAction).not.toHaveBeenCalled();
      }
    },
  );
});

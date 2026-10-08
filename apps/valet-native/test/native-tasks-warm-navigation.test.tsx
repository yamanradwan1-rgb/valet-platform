import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmployeeOperationalSession,
} from "@valet/employee-client";
import {
  deferred,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./native-warm-tasks-queue-fixture";

const mounted = vi.hoisted(() => ({
  dependencies: null as readonly unknown[] | null,
  effectRuns: 0,
  routeRef: { current: null as { destination: string; scopeKey: string } | null },
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (callback: () => void, dependencies: readonly unknown[]) => {
      if (
        mounted.dependencies === null ||
        dependencies.some(
          (value, index) => !Object.is(value, mounted.dependencies?.[index]),
        )
      ) {
        mounted.dependencies = [...dependencies];
        mounted.effectRuns += 1;
        callback();
      }
    },
    useRef: () => mounted.routeRef,
    useState: <T,>(value: T) => [value, vi.fn()],
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  FlatList: "FlatList",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { ProductionShellController } =
  await import("../src/shell/production-shell-controller");
const { useNativeTasksRouteRevalidation } =
  await import("../src/shell/use-native-tasks-route-revalidation");
const { NativeTasksPanel } = await import("../src/tasks/native-tasks-panel");
const { NativeTaskCard } = await import("../src/tasks/native-task-card");
const { nativeTaskActionLabel } =
  await import("../src/tasks/native-task-presentation");
const { getNativeTasksCopy } = await import("../src/tasks/native-tasks-copy");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function Observe(
  session: EmployeeOperationalSession,
  controller: InstanceType<typeof ProductionShellController>,
) {
  const shell = controller.update(
    { authGeneration: 1, phase: "authenticated" },
    session.current(),
  );
  useNativeTasksRouteRevalidation(session, shell, 1);
  return shell;
}

afterEach(() => {
  mounted.dependencies = null;
  mounted.effectRuns = 0;
  mounted.routeRef.current = null;
});

describe("Issue 272: production route→GET→snapshot→Tasks card", () => {
  it.each([
    ["Check-In", "ACCEPTED", "AWAITING_PARKING", "startParking"],
    ["Parking", "IN_PROGRESS", "PARKING", "continueParking"],
  ] as const)(
    "recovers a %s task via warm Tasks entry with %s action, no restart or mutation",
    async (_flow, status, valetSessionState, expectedAction) => {
      const older = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
      const transport = new StubOperationalTransport();
      transport.contextResults.push(Promise.resolve(operationalContext()));
      transport.queueResults.push(
        Promise.resolve({ tasks: [] }),
        older.promise,
        Promise.resolve({
          tasks: [parkingTask({ status, valetSessionState, version: 5 })],
        }),
      );
      const session = new EmployeeOperationalSession({ transport });
      try {
        await session.activate(1);
        const controller = new ProductionShellController();
        controller.update(
          { authGeneration: 1, phase: "authenticated" },
          session.current(),
        );
        controller.receive({ destination: "vehicles", source: "navigation" });
        Observe(session, controller);

        const beforeMutation = session.refreshQueue();
        controller.receive({ destination: "tasks", source: "navigation" });
        expect(Observe(session, controller)).toMatchObject({
          destination: "tasks",
        });
        await vi.waitFor(() => expect(transport.queueCalls).toHaveLength(3));
        older.resolve({ tasks: [] });
        await beforeMutation;
        await vi.waitFor(() =>
          expect(session.current().tasks[0]?.status).toBe(status),
        );

        const snapshot = session.current();
        const nodes = elements(
          NativeTasksPanel({
            locale: "en",
            operations: session,
            snapshot,
            textAlign: "left",
          }),
        );
        const card = nodes.find((node) => node.type === NativeTaskCard);
        expect(card?.props.task).toMatchObject({ status, version: 5 });
        const copy = getNativeTasksCopy("en");
        expect(nativeTaskActionLabel(copy, snapshot.tasks[0]!)).toBe(
          copy[expectedAction],
        );
        Observe(session, controller);
        expect(transport.queueCalls).toHaveLength(3);
        expect(transport.acceptCalls).toEqual([]);
        expect(transport.assignCalls).toEqual([]);
      } finally {
        session.dispose();
      }
    },
  );
});

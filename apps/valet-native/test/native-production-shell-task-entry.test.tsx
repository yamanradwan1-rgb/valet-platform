import { describe, expect, it, vi } from "vitest";
import { EmployeeOperationalSession } from "@valet/employee-client";
import {
  deferred,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./native-warm-tasks-queue-fixture";

const mounted = vi.hoisted(() => ({
  bootstrap: null as unknown,
  effectIndex: 0,
  effects: [] as Array<readonly unknown[]>,
  pending: [] as Array<() => void>,
  stateIndex: 0,
  states: [] as unknown[],
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
}));

vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useRef: (initial: unknown) => {
      const index = mounted.refIndex++;
      if (!(index in mounted.refs)) mounted.refs[index] = { current: initial };
      return mounted.refs[index];
    },
    useState: (initial: unknown) => {
      const index = mounted.stateIndex++;
      if (!(index in mounted.states)) {
        mounted.states[index] =
          typeof initial === "function" ? (initial as () => unknown)() : initial;
      }
      return [
        mounted.states[index],
        (value: unknown) => {
          mounted.states[index] =
            typeof value === "function"
              ? (value as (previous: unknown) => unknown)(mounted.states[index])
              : value;
        },
      ];
    },
    useEffect: (effect: () => void, deps: readonly unknown[]) => {
      const index = mounted.effectIndex++;
      const before = mounted.effects[index];
      if (
        before === undefined ||
        deps.length !== before.length ||
        deps.some((value, position) => !Object.is(value, before[position]))
      ) {
        mounted.effects[index] = [...deps];
        mounted.pending.push(effect);
      }
    },
  };
});

vi.mock("../src/shell/native-production-bootstrap", () => ({
  createNativeProductionBootstrap: () => mounted.bootstrap,
}));
vi.mock("../src/i18n/use-native-employee-locale", () => ({
  useNativeEmployeeLocale: () => ({ locale: "en", setLocale: vi.fn() }),
}));
vi.mock("../src/notifications/use-native-push-attention", () => ({
  useNativePushAttention: () => ({
    push: { requestPermission: vi.fn(), snapshot: {} },
    response: { openCurrentTaskQueue: vi.fn() },
    retrievalAttention: { attention: [], dismiss: vi.fn() },
  }),
}));
vi.mock("../src/shell/use-native-production-lifecycle", () => ({
  useNativeProductionLifecycle: () => "online",
}));
vi.mock("../src/shell/use-native-contextual-route", () => ({
  useNativeContextualRoute: () => ({
    onSystemBack: () => false,
    route: null,
  }),
}));
vi.mock("../src/vehicles/use-native-vehicle-directory-revalidation", () => ({
  useNativeVehicleDirectoryRevalidation: vi.fn(),
}));
vi.mock("../src/shell/native-production-back-handler", () => ({
  useNativeProductionBackHandler: vi.fn(),
}));
vi.mock("../src/shell/native-production-workspace", () => ({
  NativeProductionWorkspace: () => null,
}));
vi.mock("../src/shell/native-shell-gate", () => ({
  NativeShellGate: () => null,
}));
vi.mock("../src/shift/native-shift-detached-screen", () => ({
  NativeShiftDetachedScreen: () => null,
}));
vi.mock("../src/shell/native-workflow-scope-retirement", () => ({
  retireNativeWorkflowScope: vi.fn(),
}));
vi.mock("../src/diagnostics/native-physical-diagnostics", () => ({
  beginPhysicalMetric: vi.fn(),
  classifyPhysicalBootstrap: vi.fn(),
  observeOperationalReady: vi.fn(),
}));

const { NativeProductionShell } = await import("../src/shell/native-production-shell");

function renderShell() {
  mounted.effectIndex = 0;
  mounted.stateIndex = 0;
  mounted.refIndex = 0;
  mounted.pending = [];
  const tree = NativeProductionShell({});
  const pending = [...mounted.pending];
  pending.forEach((effect) => effect());
  return tree as {
    props: {
      navigate: (destination: "tasks" | "vehicles" | "check-in" | "parking") => void;
      operations: ReturnType<EmployeeOperationalSession["current"]>;
      shell: { destination: string; kind: string };
    };
  };
}

describe("Issue 272: real mounted production shell route-entry integration", () => {
  it.each([
    ["check-in", "ACCEPTED", "AWAITING_PARKING"],
    ["parking", "IN_PROGRESS", "PARKING"],
  ] as const)("wires warm %s→Tasks and publishes %s work", async (from, status, valetSessionState) => {
    const old = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [] }),
      old.promise,
      Promise.resolve({
        tasks: [parkingTask({ status, valetSessionState, version: 3 })],
      }),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);
    const subscription = vi.fn(() => () => undefined);
    const ops = {
      activate: vi.fn(),
      clear: vi.fn(),
      current: session.current,
      refreshQueueForNavigation: () => session.refreshQueueForNavigation(),
      subscribe: (listener: (value: unknown) => void) => session.subscribe(listener as never),
    };
    const stable = (value: unknown) => ({
      activate: vi.fn(),
      clear: vi.fn(),
      current: () => value,
      subscribe: subscription,
    });
    const auth = { authGeneration: 1, phase: "authenticated" };
    const inactive = { phase: "inactive", task: null };
    const runtime = {
      auth: { ...stable(auth), start: vi.fn() },
      confirmParking: stable(inactive),
      handoff: stable(inactive),
      operations: ops,
      parking: stable(inactive),
      release: stable(inactive),
      retrieval: stable(inactive),
      shiftStart: stable(inactive),
      shiftEnd: stable(inactive),
      vehicleDirectory: stable(inactive),
      dispose: vi.fn(),
    };
    mounted.bootstrap = {
      auth,
      confirmParking: inactive,
      handoff: inactive,
      operations: session.current(),
      parking: inactive,
      release: inactive,
      retrieval: inactive,
      runtime,
      shiftStart: inactive,
      shiftEnd: inactive,
      vehicleDirectory: inactive,
    };
    mounted.effects = [];
    mounted.states = [];
    mounted.refs = [];
    try {
      const first = renderShell();
      expect(first.props.shell.destination).toBe("tasks");
      expect(transport.queueCalls).toHaveLength(1);
      first.props.navigate(from);
      const warm = renderShell();
      expect(warm.props.shell.destination).toBe(from);
      const oldRequest = session.refreshQueue();
      warm.props.navigate("tasks");
      const tasks = renderShell();
      expect(tasks.props.shell.destination).toBe("tasks");
      expect(transport.queueCalls).toHaveLength(3);
      old.resolve({ tasks: [] });
      await oldRequest;
      await vi.waitFor(() =>
        expect(session.current().tasks[0]?.status).toBe(status),
      );
      expect(renderShell().props.operations.tasks).toMatchObject([
        { status, version: 3 },
      ]);
      expect(transport.acceptCalls).toEqual([]);
      expect(transport.assignCalls).toEqual([]);
    } finally {
      session.dispose();
    }
  });
});

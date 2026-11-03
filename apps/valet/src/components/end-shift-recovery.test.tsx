import { act } from "react";
import {
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeApp } from "./employee-app";
import type { OperationalScopeResolution } from "../features/staff-operational-context";
import { EmployeeApiError } from "../lib/api/employee-api-errors";
import {
  CASH,
  SHIFT_A,
  SHIFT_B,
  activeResolution,
  endedResponse,
} from "./end-shift-recovery-fixture";

const endShiftSession = vi.hoisted(() => vi.fn());
const refreshContext = vi.fn(async () => {});
const revalidateOnAuthLoss = vi.fn(async () => {});
const authClient = { logout: vi.fn(async () => {}) };
const taskQueue = {
  client: {},
  error: null,
  isHardStopped: false,
  isLoading: false,
  isRefreshing: false,
  successfulSnapshotCount: 0,
  tasks: [],
};

let identityGeneration = 1;
let resolution: OperationalScopeResolution;
let capturedHookOptions: {
  onAuthorizationLoss?: (() => void) | undefined;
  onEnded?: ((result: ReturnType<typeof endedResponse>) => void) | undefined;
} = {};
let mounted: ReactTestRenderer | null = null;

vi.mock("../features/shift/shift-api", () => ({ endShiftSession }));
vi.mock("../features/shift", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/shift")>();
  return {
    ...actual,
    // Observe callbacks while executing the real useEndShift/controller state.
    useEndShift: (options: Parameters<typeof actual.useEndShift>[0]) => {
      capturedHookOptions = {
        onAuthorizationLoss: options?.onAuthorizationLoss,
        onEnded: options?.onEnded,
      };
      return actual.useEndShift(options);
    },
  };
});
vi.mock("../features/staff-operational-context", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../features/staff-operational-context")
    >();
  return {
    ...actual,
    useStaffOperationalContext: () => ({
      error: null,
      refresh: refreshContext,
      revalidateOnAuthLoss,
      resolution,
      response: {
        contexts:
          resolution.kind === "RESOLVED"
            ? [resolution.scope.activeContext]
            : [],
      },
    }),
  };
});
vi.mock("../lib/auth/staff-auth-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/auth/staff-auth-context")>();
  return {
    ...actual,
    useOptionalStaffAuth: () => ({
      client: authClient,
      identityGeneration,
      sessionGeneration: 1,
      status: "authenticated",
    }),
  };
});
vi.mock("../features/task-queue/use-task-queue", () => ({
  useTaskQueue: () => taskQueue,
}));
// Node's mounted renderer has no browser connectivity API; online is only a hint.
vi.mock("../lib/connectivity/use-online-status", () => ({
  useOnlineStatus: () => true,
}));
vi.mock("./shell/connectivity-banner", () => ({
  ConnectivityBanner: () => null,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function displayed(): string {
  return JSON.stringify(mounted!.toJSON());
}

function textOf(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(textOf).join("");
}

function button(label: string): ReactTestInstance {
  const matches = mounted!.root
    .findAllByType("button")
    .filter((node) => textOf(node) === label);
  expect(matches, "button " + label).toHaveLength(1);
  return matches[0]!;
}

async function mountApp(): Promise<void> {
  await act(async () => {
    mounted = create(<EmployeeApp />);
  });
}

async function rerender(): Promise<void> {
  await act(async () => {
    mounted!.update(<EmployeeApp />);
  });
}

async function click(label: string): Promise<void> {
  await act(async () => {
    button(label).props.onClick();
  });
}

async function submitAndBecomeUncertain(): Promise<void> {
  endShiftSession.mockRejectedValueOnce(
    new EmployeeApiError({
      code: "NETWORK_ERROR",
      isNetworkError: true,
      message: "Disconnected",
      status: 0,
    }),
  );
  await mountApp();
  await click("Shift");
  await act(async () => {
    mounted!.root
      .findByProps({ id: "end-shift-cash-reported" })
      .props.onChange({
        target: { value: CASH },
      });
  });
  await click("End Shift");
  await click("Confirm end shift");
  expect(endShiftSession).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    SHIFT_A,
    CASH,
  );
  expect(displayed()).toContain("may or may not have ended");
  expect(displayed()).not.toContain("Shift ended");
}

beforeEach(() => {
  resolution = activeResolution(SHIFT_A);
  identityGeneration = 1;
  capturedHookOptions = {};
  endShiftSession.mockReset();
  refreshContext.mockClear();
  revalidateOnAuthLoss.mockClear();
});

afterEach(async () => {
  if (mounted !== null) {
    await act(async () => {
      mounted!.unmount();
    });
    mounted = null;
  }
});

/** DEC-066 §4: owner is established ONLY by a mounted explicit scoped submit. */
describe("DEC-066 §4 ambiguous End Shift reconnect recovery", () => {
  it("keeps the same command through NO_ACTIVE_SHIFT and retries without premature success", async () => {
    await submitAndBecomeUncertain();
    resolution = { kind: "NO_ACTIVE_SHIFT" };
    await rerender();

    expect(displayed()).toContain("Confirm your end shift result");
    expect(displayed()).toContain("may or may not have ended");
    expect(displayed()).toContain("Retry end shift");
    expect(displayed()).not.toContain("No active shift");
    expect(displayed()).not.toContain("Shift ended");
    expect(refreshContext).not.toHaveBeenCalled();
    expect(endShiftSession).toHaveBeenCalledTimes(1);

    const ended = endedResponse(SHIFT_A);
    let finishRetry: ((value: typeof ended) => void) | undefined;
    endShiftSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRetry = resolve;
        }),
    );
    await click("Retry end shift");

    expect(endShiftSession).toHaveBeenCalledTimes(2);
    expect(endShiftSession).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      SHIFT_A,
      CASH,
    );
    expect(refreshContext).not.toHaveBeenCalled();
    expect(displayed()).not.toContain("Shift ended");
    await act(async () => {
      finishRetry?.(ended);
    });
    expect(refreshContext).toHaveBeenCalledTimes(1);
    expect(displayed()).toContain("No active shift");
    expect(displayed()).not.toContain("Confirm your end shift result");
  });

  it.each(["different active Shift", "different identity"] as const)(
    "does not leak an old uncertain command into a %s",
    async (change) => {
      await submitAndBecomeUncertain();
      if (change === "different active Shift") {
        resolution = activeResolution(SHIFT_B);
      } else {
        identityGeneration += 1;
        resolution = { kind: "NO_ACTIVE_SHIFT" };
      }
      await rerender();
      expect(displayed()).not.toContain("Confirm your end shift result");
      expect(displayed()).not.toContain("Retry end shift");
      expect(endShiftSession).toHaveBeenCalledTimes(1);

      resolution = { kind: "NO_ACTIVE_SHIFT" };
      await rerender();
      expect(displayed()).toContain("No active shift");
      expect(displayed()).not.toContain("Retry end shift");
      expect(refreshContext).not.toHaveBeenCalled();
    },
  );

  it("shows the ordinary No Active Shift gate without a submitted command", async () => {
    resolution = { kind: "NO_ACTIVE_SHIFT" };
    await mountApp();
    expect(displayed()).toContain("No active shift");
    expect(displayed()).not.toContain("Confirm your end shift result");
    expect(endShiftSession).not.toHaveBeenCalled();
  });

  it("keeps the auth-loss and confirmed-end context refresh wiring", async () => {
    await mountApp();
    expect(typeof capturedHookOptions.onAuthorizationLoss).toBe("function");
    capturedHookOptions.onAuthorizationLoss?.();
    expect(revalidateOnAuthLoss).toHaveBeenCalledTimes(1);

    expect(typeof capturedHookOptions.onEnded).toBe("function");
    capturedHookOptions.onEnded?.(endedResponse(SHIFT_A));
    expect(refreshContext).toHaveBeenCalledTimes(1);
  });
});

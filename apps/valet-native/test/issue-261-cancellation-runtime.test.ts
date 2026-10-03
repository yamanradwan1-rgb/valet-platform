import { describe, expect, it, vi } from "vitest";
import { scope, operations } from "./production-shell-test-fixture";
const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/tasks/native-operational-http", () => ({
  createNativeEmployeeClient: () => http,
}));
const { createNativeParkingCancellation } =
  await import("../src/parking/native-parking-cancellation-runtime");
const target = {
  identityGeneration: 7,
  scope,
  sessionId: "44444444-4444-4444-8444-444444444444",
  taskId: "66666666-6666-4666-8666-666666666666",
  expectedShiftId: scope.shiftId,
  expectedSessionVersion: 1,
  expectedTaskVersion: 3,
};
const terminal = {
  sessionId: target.sessionId,
  taskId: target.taskId,
  sessionVersion: 2,
  taskVersion: 4,
  state: "CANCELLED",
  taskStatus: "CANCELLED",
  cancelledAt: "2026-10-03T10:00:00.000Z",
};
function fixture() {
  let operational = operations("ready", { generation: 7 });
  let selected = {
    identityGeneration: 7,
    session: { sessionId: target.sessionId },
    task: { taskId: target.taskId },
  };
  let observeScope!: (value: typeof operational) => void;
  let observeParking!: (value: typeof selected) => void;
  const auth = {
    current: () => ({ phase: "authenticated", authGeneration: 7 }),
  };
  const ops = {
    current: () => operational,
    retireTaskAfterTerminalMutation: vi.fn().mockResolvedValue(undefined),
    subscribe: (listener: typeof observeScope) => {
      observeScope = listener;
      listener(operational);
    },
  };
  const parking = {
    current: () => selected,
    clear: vi.fn(),
    subscribe: (listener: typeof observeParking) => {
      observeParking = listener;
      listener(selected);
    },
  };
  const confirmation = { clear: vi.fn() };
  const cancellation = createNativeParkingCancellation(
    "https://example.test",
    auth as never,
    ops as never,
    parking as never,
    confirmation as never,
  );
  return {
    cancellation,
    ops,
    parking,
    confirmation,
    scopeChange: (next: typeof operational) => {
      operational = next;
      observeScope(next);
    },
    selectionChange: (next: typeof selected) => {
      selected = next;
      observeParking(next);
    },
  };
}
describe("Issue #261 exact Native runtime ownership", () => {
  it("clears selected Parking/confirmation and requests exactly one fresh queue after terminal proof", async () => {
    http.request.mockReset().mockResolvedValue(terminal);
    const ctx = fixture();
    ctx.cancellation.confirm(target);
    await ctx.cancellation.submit();
    expect(ctx.parking.clear).toHaveBeenCalledOnce();
    expect(ctx.confirmation.clear).toHaveBeenCalledOnce();
    expect(
      ctx.ops.retireTaskAfterTerminalMutation,
    ).toHaveBeenCalledExactlyOnceWith(target.taskId);
  });
  it.each(["SCOPE", "SELECTION"])(
    "rejects late success after %s A-B-A retirement",
    async (kind) => {
      let resolve!: (value: unknown) => void;
      http.request.mockReset().mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const ctx = fixture();
      ctx.cancellation.confirm(target);
      const post = ctx.cancellation.submit();
      if (kind === "SCOPE") {
        ctx.scopeChange(
          operations("ready", {
            generation: 7,
            retainedScope: { ...scope, shiftId: "B" },
          }),
        );
        ctx.scopeChange(operations("ready", { generation: 7 }));
      } else {
        ctx.selectionChange({
          identityGeneration: 7,
          session: { sessionId: "B" },
          task: { taskId: "B" },
        });
        ctx.selectionChange({
          identityGeneration: 7,
          session: { sessionId: target.sessionId },
          task: { taskId: target.taskId },
        });
      }
      resolve(terminal);
      await post;
      expect(ctx.cancellation.current()).toEqual({
        phase: "idle",
        target: null,
      });
      expect(ctx.ops.retireTaskAfterTerminalMutation).not.toHaveBeenCalled();
      expect(ctx.parking.clear).not.toHaveBeenCalled();
      expect(ctx.confirmation.clear).not.toHaveBeenCalled();
    },
  );
});

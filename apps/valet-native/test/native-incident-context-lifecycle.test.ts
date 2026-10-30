import type {
  IncidentRecoveryContext,
  StaffOperationalContextResponse,
} from "@valet/employee-client";
import { expect, it, vi } from "vitest";
import { NativeIncidentContextObserver } from "../src/incident/native-incident-context-observer";
import {
  contextA,
  deferred,
  fenceHarness,
} from "./native-incident-fence-test-fixture";

const response = { contexts: [] } as unknown as StaffOperationalContextResponse;

it.each([
  { context: contextA, phase: "recovery-reserved" },
  { context: "invalidated" as const, phase: "recovery-invalidated" },
  { context: null, phase: "inactive" },
])(
  "current context $phase retains its established behavior",
  async ({ context, phase }) => {
    const h = fenceHarness();
    const observer = new NativeIncidentContextObserver(
      h.session,
      async () => context,
      () => true,
    );
    await observer.observe(1, response);
    expect(h.session.current().phase).toBe(phase);
  },
);

it.each(["background", "clear", "fence", "purge"] as const)(
  "operational context resolving after %s cannot start fresh recovery",
  async (boundary) => {
    const h = fenceHarness();
    const resolution = deferred<IncidentRecoveryContext>();
    const observer = new NativeIncidentContextObserver(
      h.session,
      () => resolution.promise,
      () => true,
    );
    const pending = observer.observe(1, response);
    if (boundary === "background") h.session.suspendForBackground();
    else if (boundary === "clear") h.session.clear();
    else if (boundary === "fence")
      h.session.fenceRecovery("recovery-invalidated");
    else await h.session.purgeRecovery();
    const current = h.session.current();
    const count = h.notifications.length;
    resolution.resolve(contextA);
    await pending;
    expect(h.recovery.restore).not.toHaveBeenCalled();
    expect(h.session.current()).toBe(current);
    expect(h.notifications).toHaveLength(count);
  },
);

it.each(["success", "failure"])(
  "operational invalidation purge %s after background cannot publish its final fence",
  async (outcome) => {
    const h = fenceHarness();
    const entered = deferred();
    const cleanup = deferred();
    h.recovery.purge.mockImplementationOnce(() => {
      entered.resolve();
      return cleanup.promise;
    });
    const fence = vi.spyOn(h.session, "fenceRecovery");
    const observer = new NativeIncidentContextObserver(
      h.session,
      async () => "invalidated",
      () => true,
    );
    const pending = observer.observe(1, response);
    await entered.promise;
    h.session.suspendForBackground();
    const current = h.session.current();
    const count = h.notifications.length;
    if (outcome === "success") cleanup.resolve();
    else cleanup.reject(new Error("synthetic cleanup failure"));
    await pending;
    expect(h.session.current()).toBe(current);
    expect(h.notifications).toHaveLength(count);
    expect(fence).not.toHaveBeenCalled();
  },
);

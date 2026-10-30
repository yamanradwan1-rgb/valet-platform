import { afterEach, describe, expect, it } from "vitest";

import { resetNativeTelemetryRegistryForTests } from "../src/telemetry/native-telemetry-owner";
import { recoveryRing } from "./native-incident-recovery-telemetry-fixture";
import { detail, sessionId } from "./native-parity-11-test-fixture";
import {
  contextA,
  deferred,
  fenceHarness,
  markerFor,
  resolved,
  type RecoveryAction,
} from "./native-incident-fence-test-fixture";

afterEach(() => resetNativeTelemetryRegistryForTests());
const actions: RecoveryAction[] = ["restore", "retire", "acknowledge", "purge"];
const replacements = [
  {
    name: "actor",
    context: { ...contextA, membershipId: contextA.locationId },
  },
  {
    name: "organization",
    context: { ...contextA, organizationId: contextA.locationId },
  },
  {
    name: "location",
    context: { ...contextA, locationId: contextA.organizationId },
  },
  {
    name: "installation",
    context: {
      ...contextA,
      installationGeneration: "replacement-installation",
    },
  },
];

describe("Issue #377 cleanup completion cannot replace current recovery authority", () => {
  for (const action of actions) {
    it.each(replacements)(
      `${action} success preserves replacement $name and subscribers`,
      async ({ context }) => {
        const h = fenceHarness();
        const pending = await h.begin(action);
        await h.session.observeRecoveryContext(context);
        const current = h.session.current();
        const count = h.notifications.length;
        pending.cleanup.resolve();
        const result = await pending.result;
        expect(result.error).toBeUndefined();
        if (action === "acknowledge") expect(result.value).toBe(false);
        expect(h.session.current()).toBe(current);
        expect(h.notifications).toHaveLength(count);
        // The newer marker, not just its presentation, must still be retained.
        await h.session.retire();
        expect(h.recovery.retire).toHaveBeenLastCalledWith(markerFor(context));
        expect(h.request).not.toHaveBeenCalled();
        expect(h.recovery.reserve).not.toHaveBeenCalled();
      },
    );

    it(`${action} rejection cannot overwrite replacement state`, async () => {
      const h = fenceHarness();
      const pending = await h.begin(action);
      await h.session.observeRecoveryContext(replacements[0]!.context);
      const current = h.session.current();
      const count = h.notifications.length;
      const failure = new Error("synthetic cleanup failure");
      pending.cleanup.reject(failure);
      const result = await pending.result;
      if (action === "purge") expect(result.error).toBe(failure);
      if (action === "acknowledge") expect(result.value).toBe(false);
      expect(h.session.current()).toBe(current);
      expect(h.notifications).toHaveLength(count);
      expect(h.request).not.toHaveBeenCalled();
    });
  }

  it.each(["restore", "retire", "acknowledge"] as const)(
    "%s completion after identity purge stays inactive",
    async (action) => {
      const h = fenceHarness();
      const pending = await h.begin(action);
      await h.session.purgeRecovery();
      const count = h.notifications.length;
      pending.cleanup.resolve();
      await pending.result;
      expect(h.session.current()).toMatchObject({
        phase: "inactive",
        report: null,
      });
      expect(h.notifications).toHaveLength(count);
    },
  );

  for (const action of actions)
    it.each(["clear", "fence", "background"] as const)(
      `pending ${action} respects %s invalidation`,
      async (boundary) => {
        const h = fenceHarness();
        const pending = await h.begin(action);
        if (boundary === "clear") h.session.clear();
        else if (boundary === "fence")
          h.session.fenceRecovery("recovery-invalidated");
        else h.session.suspendForBackground();
        const current = h.session.current();
        const count = h.notifications.length;
        pending.cleanup.resolve();
        await pending.result;
        expect(h.session.current()).toBe(current);
        expect(h.notifications).toHaveLength(count);
      },
    );

  it.each(["purge-first", "acknowledge-first"])(
    "replacement wins simultaneous purge/acknowledge cleanup: %s",
    async (order) => {
      const h = fenceHarness();
      const acknowledge = await h.begin("acknowledge");
      const entered = deferred();
      const cleanup = deferred();
      h.recovery.purge.mockImplementationOnce(() => {
        entered.resolve();
        return cleanup.promise;
      });
      const purge = h.session.purgeRecovery();
      await entered.promise;
      await h.session.observeRecoveryContext(replacements[0]!.context);
      const current = h.session.current();
      const count = h.notifications.length;
      if (order === "purge-first") {
        cleanup.resolve();
        await purge;
        acknowledge.cleanup.resolve();
      } else {
        acknowledge.cleanup.resolve();
        await acknowledge.result;
        cleanup.resolve();
      }
      const result = await acknowledge.result;
      await purge;
      expect(result.value).toBe(false);
      expect(h.session.current()).toBe(current);
      expect(h.notifications).toHaveLength(count);
    },
  );

  it("restore read finishing after purge never reaches resolution cleanup", async () => {
    const h = fenceHarness();
    const read = deferred<Awaited<ReturnType<typeof h.recovery.restore>>>();
    h.recovery.restore.mockImplementationOnce(() => read.promise);
    const old = h.session.observeRecoveryContext(contextA);
    await h.session.purgeRecovery();
    const count = h.notifications.length;
    read.resolve(resolved(contextA, "UNKNOWN"));
    await old;
    expect(h.recovery.clearResolved).not.toHaveBeenCalled();
    expect(h.notifications).toHaveLength(count);
    expect(h.session.current().phase).toBe("inactive");
  });

  it.each(["restore", "retire", "acknowledge", "purge"] as const)(
    "current %s cleanup failure retains safe error behavior",
    async (action) => {
      const h = fenceHarness();
      const pending = await h.begin(action);
      const failure = new Error("synthetic cleanup failure");
      pending.cleanup.reject(failure);
      const result = await pending.result;
      expect(h.session.current().phase).toBe("recovery-unavailable");
      if (action === "purge") expect(result.error).toBe(failure);
      if (action === "acknowledge") expect(result.value).toBe(false);
    },
  );

  it("retries only canonical reads and never replays an Incident submission", async () => {
    const h = fenceHarness();
    await h.session.observeRecoveryContext(contextA);
    await h.session.retryRecovery();
    await h.session.retryRecovery();
    await h.session.retire();
    await h.session.acknowledge();
    expect(h.recovery.restore).toHaveBeenCalledTimes(3);
    expect(h.request).not.toHaveBeenCalled();
    expect(h.recovery.reserve).not.toHaveBeenCalled();
    expect(h.recovery.prepare).not.toHaveBeenCalled();
  });

  it("marker preparation completing after purge cannot repopulate the in-memory marker", async () => {
    const h = fenceHarness();
    h.recovery.restore.mockResolvedValueOnce({ kind: "empty" } as never);
    h.request.mockResolvedValue(detail());
    const entered = deferred();
    const marker = deferred<ReturnType<typeof markerFor>>();
    h.recovery.prepare.mockImplementationOnce(() => {
      entered.resolve();
      return marker.promise;
    });
    await h.session.observeRecoveryContext(contextA);
    await h.session.open({ origin: "PARKING", sessionId });
    const pending = h.session.submit({
      description: "Synthetic damage",
      severity: "HIGH",
      type: "VEHICLE_DAMAGE",
    });
    await entered.promise;
    await h.session.purgeRecovery();
    const count = h.notifications.length;
    marker.resolve(markerFor(contextA));
    expect(await pending).toBe(false);
    await h.session.retire();
    expect(h.recovery.retire).not.toHaveBeenCalled();
    expect(h.recovery.reserve).not.toHaveBeenCalled();
    expect(h.session.current().phase).toBe("inactive");
    expect(h.notifications).toHaveLength(count);
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("a delayed resolution records one telemetry event, never a duplicate", async () => {
    const buffer = recoveryRing();
    const h = fenceHarness();
    const pending = await h.begin("restore");
    pending.cleanup.resolve();
    await pending.result;
    expect(
      buffer.current().filter((event) => event.classification === "unknown"),
    ).toHaveLength(1);
    expect(h.session.current().phase).toBe("recovery-unknown");
  });
});

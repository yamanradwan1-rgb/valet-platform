import {
  auth,
  backFrom,
  interruptionHooks as hooks,
  start,
} from "./native-check-in-interruption-fixture";
import { employeeNetworkError } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

import { useNativePushAttention } from "../src/notifications/use-native-push-attention";
import { retireNativeWorkflowScope } from "../src/shell/native-workflow-scope-retirement";
import { deferred } from "./native-push-fixture";
import { responseIntent, routeSnapshot } from "./native-push-route-fixture";
import { scope } from "./production-shell-test-fixture";

const serverDetail = {
  checkIn: { conditionCompletedAt: null },
  locationId: scope.locationId,
  sessionId: "persisted-check-in",
  state: "CHECKING_IN",
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "RAV4",
    vehicleId: "vehicle-a",
    vehicleUpdatedAt: "2026-11-12T00:00:00Z",
  },
  version: 1,
};

describe("production Check-In continuity", () => {
  it.each(["header", "hardware"] as const)(
    "allows only one %s Back until forward progress",
    async (trigger) => {
      const h = await start();
      const back = () =>
        trigger === "header" ? backFrom(h.render())() : hooks.onBack?.();
      const draft = h.checkIn.current();
      back();
      expect(h.checkIn.current()).toMatchObject({
        phase: "vehicle-details",
        vehicle: draft.vehicle,
        customerPhone: "07912",
      });
      back();
      expect(h.checkIn.current().phase).toBe("vehicle-details");
      expect(h.update()).toMatchObject({ destination: "check-in" });
      h.checkIn.continueVehicleDetails();
      back();
      expect(h.checkIn.current().phase).toBe("vehicle-details");
      expect(h.onClose).not.toHaveBeenCalled();
      expect(h.transport.createIntake).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["system", "en", "light"],
    ["system", "ar", "dark"],
    ["banner", "en", "dark"],
    ["banner", "ar", "light"],
  ] as const)(
    "keeps the real draft and correction window after %s opens Tasks (%s/%s)",
    async (surface, locale, theme) => {
      const h = await start(locale, theme);
      const draft = h.checkIn.current();
      const onRoute = vi.fn();
      const { response } = useNativePushAttention(
        h.runtime,
        auth,
        locale,
        h.operations.current(),
        "online",
        h.controller,
        onRoute,
      );
      h.operations.onRefresh = () => {
        h.operations.currentSnapshot = routeSnapshot({ count: 1 });
      };
      if (surface === "system") {
        hooks.onResponse?.(responseIntent());
        hooks.onResponse?.(responseIntent());
      } else response.openCurrentTaskQueue();

      await vi.waitFor(() => expect(onRoute).toHaveBeenCalledOnce());
      expect(h.update()).toMatchObject({ destination: "tasks" });
      expect(h.checkIn.current()).toBe(draft);
      h.detach();
      expect(h.navigate("check-in")).toMatchObject({ destination: "check-in" });
      h.mountCheckIn();
      const back = backFrom(h.render());
      back();
      expect(h.checkIn.current()).toMatchObject({
        phase: "vehicle-details",
        vehicle: draft.vehicle,
        customerPhone: draft.customerPhone,
      });
      expect(hooks.onBack?.()).toBe(true);
      expect(h.checkIn.current().phase).toBe("vehicle-details");
      h.checkIn.continueVehicleDetails();
      backFrom(h.render())();
      expect(h.checkIn.current().phase).toBe("vehicle-details");
      expect(h.transport.createIntake).not.toHaveBeenCalled();
      expect(h.transport.loadDrafts).toHaveBeenCalledOnce();
      expect(h.operations.refreshCalls).toBe(1);
    },
  );

  it("holds a route during revalidation without calling the completion callback", async () => {
    const h = await start();
    const onRoute = vi.fn();
    const draft = h.checkIn.current();
    const refresh = deferred<void>();
    const { response } = useNativePushAttention(
      h.runtime,
      auth,
      "en",
      h.operations.current(),
      "online",
      h.controller,
      onRoute,
    );
    h.operations.onRefresh = async () => {
      await refresh.promise;
      h.operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    response.openCurrentTaskQueue();
    expect(h.operations.refreshCalls).toBe(1);
    h.operations.currentSnapshot = routeSnapshot({ phase: "loading-context" });
    expect(h.update()).toEqual({ kind: "context-loading" });
    const receive = vi.spyOn(h.controller, "receive");
    refresh.resolve();
    await vi.waitFor(() => expect(receive).toHaveReturnedWith("held"));

    expect(onRoute).not.toHaveBeenCalled();
    expect(h.checkIn.current()).toBe(draft);
    expect(h.update()).toMatchObject({ destination: "tasks" });
  });

  it("reopens the exact persisted work after notification navigation", async () => {
    const h = await start();
    h.transport.createIntake.mockResolvedValue({
      ...serverDetail.vehicle,
      valetSessionId: serverDetail.sessionId,
      version: 1,
    });
    h.checkIn.setCustomerPhone("");
    await h.checkIn.submitCustomer();
    expect(h.checkIn.current().phase).toBe("created");
    const onRoute = vi.fn();
    useNativePushAttention(
      h.runtime,
      auth,
      "en",
      h.operations.current(),
      "online",
      h.controller,
      onRoute,
    );
    h.operations.onRefresh = () => {
      h.operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    hooks.onResponse?.(responseIntent());
    await vi.waitFor(() => expect(onRoute).toHaveBeenCalledOnce());
    expect(h.update()).toMatchObject({ destination: "tasks" });
    h.detach();
    h.transport.loadSession.mockResolvedValue(serverDetail);
    h.navigate("check-in");
    h.mountCheckIn();
    await vi.waitFor(() =>
      expect(h.checkIn.current()).toMatchObject({
        phase: "created",
        active: {
          sessionId: serverDetail.sessionId,
          vehicle: serverDetail.vehicle,
        },
      }),
    );
    expect(h.transport.loadSession).toHaveBeenCalledExactlyOnceWith(
      serverDetail.sessionId,
    );
    expect(h.transport.loadDrafts).toHaveBeenCalledOnce();
    expect(h.transport.createIntake).toHaveBeenCalledOnce();
  });

  it("retains a dispatched intake's unknown outcome across interruption and reconciles without replay", async () => {
    const h = await start();
    const intake = deferred<never>();
    h.transport.createIntake.mockReturnValue(intake.promise);
    h.checkIn.setCustomerPhone("");
    const submitting = h.checkIn.submitCustomer();
    const onRoute = vi.fn();
    const { response } = useNativePushAttention(
      h.runtime,
      auth,
      "en",
      h.operations.current(),
      "online",
      h.controller,
      onRoute,
    );
    h.operations.onRefresh = () => {
      h.operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    response.openCurrentTaskQueue();
    await vi.waitFor(() => expect(onRoute).toHaveBeenCalledOnce());
    expect(h.update()).toMatchObject({ destination: "tasks" });
    h.detach();
    intake.reject(employeeNetworkError());
    await submitting;
    h.navigate("check-in");
    h.mountCheckIn();
    expect(h.checkIn.current()).toMatchObject({
      phase: "intake-ambiguous",
      recoveryChecked: false,
    });
    await h.checkIn.retryIntake();
    h.transport.loadDrafts.mockResolvedValue({
      drafts: [{ sessionId: serverDetail.sessionId }],
    });
    h.transport.loadSession.mockResolvedValue(serverDetail);
    await h.checkIn.recoverAmbiguous();
    expect(h.checkIn.current().active?.sessionId).toBe(serverDetail.sessionId);
    expect(h.transport.createIntake).toHaveBeenCalledOnce();
  });

  it("still clears the draft on an explicit route exit", async () => {
    const h = await start();
    h.workflowProps().onClose();
    expect(h.onClose).toHaveBeenCalledOnce();
    expect(h.checkIn.current()).toMatchObject({
      phase: "inactive",
      customerPhone: "",
    });
    expect(h.update()).toMatchObject({ destination: "tasks" });
  });

  it("keeps Tasks pending during protected Parking cancellation", async () => {
    const h = await start();
    h.controller.receive({ destination: "parking", source: "navigation" });
    const onRoute = vi.fn();
    const { response } = useNativePushAttention(
      h.runtime,
      auth,
      "en",
      h.operations.current(),
      "online",
      h.controller,
      onRoute,
    );
    h.operations.onRefresh = () => {
      h.operations.currentSnapshot = routeSnapshot({ count: 1 });
    };
    h.setCancellationProtected(true);
    response.openCurrentTaskQueue();
    expect(h.operations.refreshCalls).toBe(0);
    expect(h.update()).toMatchObject({ destination: "parking" });
    expect(onRoute).not.toHaveBeenCalled();

    h.setCancellationProtected(false);
    await vi.waitFor(() => expect(onRoute).toHaveBeenCalledOnce());
    expect(h.operations.refreshCalls).toBe(1);
    expect(h.update()).toMatchObject({ destination: "tasks" });
  });

  it("still purges the real session at an authority boundary", async () => {
    const h = await start();
    const before = h.controller.currentWorkflowPurgeRevision();
    h.operations.currentSnapshot = routeSnapshot({ phase: "no-active-shift" });
    expect(h.update()).toEqual({ kind: "no-active-shift" });
    expect(h.controller.currentWorkflowPurgeRevision()).toBeGreaterThan(before);
    retireNativeWorkflowScope(h.runtime);
    expect(h.checkIn.current()).toMatchObject({
      phase: "inactive",
      customerPhone: "",
    });
  });
});

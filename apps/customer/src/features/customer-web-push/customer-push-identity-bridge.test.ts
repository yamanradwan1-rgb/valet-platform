import { describe, expect, it, vi } from "vitest";

import {
  handleCustomerPushClientMessage,
  respondToCustomerAuthProbe,
} from "./customer-push-identity-bridge";
import {
  createGuestReadyAlertTracker,
  observeGuestReadySnapshot,
} from "../ready-alert/guest-ready-alert-tracker";

const SESSION = "11111111-1111-4111-8111-111111111111";
const IDENTITY = `${SESSION}:2026-08-29T20:00:00.000Z`;

describe("Customer push identity bridge", () => {
  it("records the SW identity before canonical refetch so foreground sound does not replay", () => {
    const tracker = createGuestReadyAlertTracker({
      readyAt: null,
      state: "RETRIEVING",
      valetSessionId: SESSION,
      vehicle: { color: null, make: null, model: null },
    });
    const refresh = vi.fn();
    expect(
      handleCustomerPushClientMessage(
        {
          identity: IDENTITY,
          route: "GUEST_HOME",
          type: "VAYLET_CUSTOMER_PUSH_OBSERVED",
        },
        tracker,
        SESSION,
        refresh,
      ),
    ).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    expect(
      observeGuestReadySnapshot(tracker, {
        readyAt: "2026-08-29T20:00:00.000Z",
        state: "READY",
        valetSessionId: SESSION,
        vehicle: { color: null, make: null, model: null },
      }),
    ).toEqual({ kind: "NONE" });
  });

  it("rejects another session identity and reports only bounded auth-probe state", () => {
    const port = { postMessage: vi.fn() };
    expect(
      respondToCustomerAuthProbe(
        { identity: IDENTITY, type: "VAYLET_CUSTOMER_AUTH_PROBE" },
        [port],
        SESSION,
      ),
    ).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith({
      authorized: true,
      type: "VAYLET_CUSTOMER_AUTH_RESULT",
    });
    respondToCustomerAuthProbe(
      {
        identity:
          "22222222-2222-4222-8222-222222222222:2026-08-29T20:00:00.000Z",
        type: "VAYLET_CUSTOMER_AUTH_PROBE",
      },
      [port],
      SESSION,
    );
    expect(port.postMessage).toHaveBeenLastCalledWith({
      authorized: false,
      type: "VAYLET_CUSTOMER_AUTH_RESULT",
    });
    expect(
      handleCustomerPushClientMessage(
        {
          identity: `22222222-2222-4222-8222-222222222222:2026-08-29T20:00:00.000Z`,
          route: "GUEST_HOME",
          type: "VAYLET_CUSTOMER_NOTIFICATION_CLICK",
        },
        createGuestReadyAlertTracker(null),
        SESSION,
        vi.fn(),
      ),
    ).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";

import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import {
  createGuestReadyAlertTracker,
  observeGuestReadySnapshot,
} from "../ready-alert/guest-ready-alert-tracker";
import { handleCustomerPushClientMessage } from "./customer-push-identity-bridge";

const SESSION = "11111111-1111-4111-8111-111111111111";
const READY_A = "2026-08-29T20:00:00.000Z";
const READY_B = "2026-08-29T21:00:00.000Z";

function session(readyAt: string | null): GuestSafeSession {
  return {
    readyAt,
    state: readyAt === null ? "RETRIEVING" : "READY",
    valetSessionId: SESSION,
    vehicle: { color: null, make: null, model: null },
  };
}

function observed(readyAt: string) {
  return {
    identity: `${SESSION}:${readyAt}`,
    route: "GUEST_HOME",
    type: "VAYLET_CUSTOMER_PUSH_OBSERVED",
  };
}

describe("Customer push and polling presentation integration", () => {
  it("dedupes push-first and duplicate delivery without suppressing refetch", () => {
    const tracker = createGuestReadyAlertTracker(session(null));
    const refresh = vi.fn();
    handleCustomerPushClientMessage(
      observed(READY_A),
      tracker,
      SESSION,
      refresh,
    );
    handleCustomerPushClientMessage(
      observed(READY_A),
      tracker,
      SESSION,
      refresh,
    );
    expect(observeGuestReadySnapshot(tracker, session(READY_A))).toEqual({
      kind: "NONE",
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not replay a poll-first ready presentation after push", () => {
    const tracker = createGuestReadyAlertTracker(session(null));
    expect(observeGuestReadySnapshot(tracker, session(READY_A))).toEqual({
      identity: `${SESSION}:${READY_A}`,
      kind: "PRESENT",
    });
    const refresh = vi.fn();
    handleCustomerPushClientMessage(
      observed(READY_A),
      tracker,
      SESSION,
      refresh,
    );
    expect(observeGuestReadySnapshot(tracker, session(READY_A))).toEqual({
      kind: "NONE",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("tracks a distinct ready identity independently", () => {
    const tracker = createGuestReadyAlertTracker(session(null));
    handleCustomerPushClientMessage(
      observed(READY_A),
      tracker,
      SESSION,
      vi.fn(),
    );
    expect(observeGuestReadySnapshot(tracker, session(READY_B))).toEqual({
      identity: `${SESSION}:${READY_B}`,
      kind: "PRESENT",
    });
  });
});
